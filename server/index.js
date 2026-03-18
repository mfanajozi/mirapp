require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database ────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Ensure reports table exists
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      type VARCHAR(10) NOT NULL,
      content TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      is_anonymous BOOLEAN DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
  `);
  console.log('✅ Database ready');
}

// ─── File Storage ─────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads', 'audio');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `audio-${unique}.m4a`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
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

// Serve audio files statically
app.use('/uploads/audio', express.static(uploadDir));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Upload audio
app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file provided' });
    const host = `${req.protocol}://${req.get('host')}`;
    const url = `${host}/uploads/audio/${req.file.filename}`;
    res.json({ url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Save report (text or audio URL)
app.post('/api/report', async (req, res) => {
  try {
    const { type, content, is_anonymous = true } = req.body;

    if (!type || !['text', 'audio'].includes(type)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await pool.query(
      'INSERT INTO reports (type, content, is_anonymous) VALUES ($1, $2, $3) RETURNING id, created_at',
      [type, content.trim(), is_anonymous]
    );

    res.status(201).json({
      success: true,
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
    });
  } catch (err) {
    console.error('Report error:', err);
    res.status(500).json({ error: 'Failed to save report' });
  }
});

// Get all reports (admin use — protect in production)
app.get('/api/reports', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, type, content, created_at FROM reports ORDER BY created_at DESC LIMIT 100'
    );
    res.json(rows);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch reports' });
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
