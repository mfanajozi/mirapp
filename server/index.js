require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database ────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  // Base table — only id + original columns so the CREATE never fails on
  // existing databases that already have this minimal schema.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id           SERIAL PRIMARY KEY,
      type         VARCHAR(10) NOT NULL,
      content      TEXT,
      created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      is_anonymous BOOLEAN DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
  `);

  // Explicit column-by-column migration checked against information_schema.
  // This is reliable on Neon pooler connections and logs exactly what happens.
  const needed = [
    ['object_key',       'TEXT'],
    ['audio_url',        'TEXT'],
    ['user_id',          'VARCHAR(32)'],
    ['location',         'TEXT'],
    ['geo_location',     'TEXT'],
    ['report_date',      'DATE'],
    ['report_time',      'TIME'],
    ['upload_timestamp', 'TIMESTAMP WITH TIME ZONE'],
  ];

  const { rows: existing } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reports'
  `);
  const existingCols = new Set(existing.map(r => r.column_name));

  for (const [col, colType] of needed) {
    if (!existingCols.has(col)) {
      await pool.query(`ALTER TABLE reports ADD COLUMN "${col}" ${colType}`);
      console.log(`  ↳ added column: ${col}`);
    }
  }

  // Drop NOT NULL on columns that are optional depending on report type
  // (object_key and audio_url are only present on audio reports)
  await pool.query(`ALTER TABLE reports ALTER COLUMN object_key DROP NOT NULL`).catch(() => {});
  await pool.query(`ALTER TABLE reports ALTER COLUMN audio_url  DROP NOT NULL`).catch(() => {});

  // If geo_location was created as POINT type, convert it to TEXT so we can
  // store plain "lat,lon" strings without casting errors.
  await pool.query(`
    ALTER TABLE reports ALTER COLUMN geo_location TYPE TEXT USING geo_location::TEXT
  `).catch(() => {});

  // Ensure index on user_id exists
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id)
  `).catch(() => {});

  console.log('✅ Database ready');
}

// ─── AWS S3 ──────────────────────────────────────────────────────────────────
const rawBucket = (process.env.AWS_S3_BUCKET_NAME || '').replace(/^s3:\/\//, '');
const S3_BUCKET = rawBucket.split('/')[0];
const S3_PREFIX = rawBucket.includes('/') ? rawBucket.slice(rawBucket.indexOf('/') + 1) : '';

const s3 = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: {
    accessKeyId:     process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateUserId() {
  return crypto.randomBytes(12).toString('hex');
}

// ─── File Storage (in-memory → S3) ───────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(m4a|mp4|mp3|wav|aac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Upload audio to S3
app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });

    const ext = (req.file.originalname.split('.').pop() || 'm4a').toLowerCase();
    const objectKey = `${S3_PREFIX}${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

    await s3.send(new PutObjectCommand({
      Bucket:      S3_BUCKET,
      Key:         objectKey,
      Body:        req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const audioUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${objectKey}`;
    res.json({ url: audioUrl, object_key: objectKey });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed', detail: err.message });
  }
});

// Save report
app.post('/api/report', async (req, res) => {
  try {
    const {
      type,
      content,
      audio_url,
      object_key,
      location,
      geo_location,
      is_anonymous = true,
    } = req.body;

    if (!type || !['text', 'audio'].includes(type)) {
      return res.status(400).json({ error: 'type must be "text" or "audio"' });
    }

    const reportContent = type === 'audio' ? (audio_url || content) : content;
    if (!reportContent || typeof reportContent !== 'string' || !reportContent.trim()) {
      return res.status(400).json({ error: 'content is required' });
    }

    const userId    = generateUserId();
    const now       = new Date();
    const reportDate = now.toISOString().split('T')[0];
    const reportTime = now.toTimeString().slice(0, 8);

    // Store as plain "latitude,longitude" string — works for both TEXT and POINT columns
    const geoValue = geo_location
      ? (typeof geo_location === 'string'
          ? geo_location
          : `${geo_location.latitude},${geo_location.longitude}`)
      : null;

    const result = await pool.query(
      `INSERT INTO reports
         (object_key, audio_url, user_id, location, geo_location,
          report_date, report_time, upload_timestamp, type, content, is_anonymous)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, user_id, created_at`,
      [
        object_key || null,
        audio_url  || null,
        userId,
        location   || null,
        geoValue,
        reportDate,
        reportTime,
        now,
        type,
        reportContent.trim(),
        Boolean(is_anonymous),
      ]
    );

    res.status(201).json({
      success:    true,
      id:         result.rows[0].id,
      user_id:    result.rows[0].user_id,
      created_at: result.rows[0].created_at,
    });
  } catch (err) {
    console.error('Report error:', err.message);
    // Return detail in response so client can display the real error during dev
    res.status(500).json({ error: 'Failed to save report', detail: err.message });
  }
});

// Get all reports
app.get('/api/reports', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, user_id, type, content, audio_url, object_key,
             location, geo_location, report_date, report_time,
             upload_timestamp, created_at, is_anonymous
      FROM reports
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch reports', detail: err.message });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 MIRApp server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to init database:', err.message);
    process.exit(1);
  });
