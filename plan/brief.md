📱 Malicious Intent Reporting App (MIRApp)

Product Brief for Development

1. 🧭 Overview

The Malicious Intent Reporting App (MIRApp) is a mobile-first application designed to allow users to report suspicious or malicious activity anonymously via:

🎤 Voice recordings

💬 Text messages

The app prioritizes simplicity, anonymity, and speed, ensuring users can report incidents with minimal friction.

2. 🎯 Objectives

Enable quick anonymous reporting

Support audio + text submissions

Store reports securely in Neon (PostgreSQL)

Provide instant access to support channels (call + chat)

Ensure cross-platform deployment (Android & iOS)

3. 👥 Target Users

General public

Concerned citizens reporting suspicious activity

Users needing anonymous reporting tools

4. 🧱 Tech Stack
📱 Frontend (Mobile App)

Expo (React Native) via Expo.dev

Language: JavaScript / TypeScript

Navigation: Expo Router / React Navigation

UI: Native components + custom styling

☁️ Backend

Node.js (Express or lightweight API routes)

Hosting: cPanel / VPS / Cloud instance

🗄️ Database

Neon.tech (PostgreSQL)

Database Name: reports

📂 File Storage (Audio)

Server-based storage (e.g., /uploads/audio/)

Public or signed URL access

Store only file URL in database

🔌 Integrations

Zapier Chat (Embedded WebView Modal)
https://mira-virtual-counselling.zapier.app

Phone Dialer Integration

Future-ready: Twilio (optional)

5. 🧩 Core Features
5.1 🎤 Audio Reporting

User Flow:

User taps & holds record button

Audio recording starts

Release = stop recording

Audio saved locally

Upload to server

Store file URL in database

Technical Notes:

Use: expo-av for recording

Save temp file locally

Upload via API (multipart/form-data)

Server stores file → returns URL

5.2 💬 Text Reporting

User Flow:

User types message

Press send icon

Message saved to database

5.3 ☎️ Call Functionality

Tap phone icon → opens dialer

Number: +278600010111

Implementation:

Linking.openURL('tel:+278600010111');
5.4 💬 Chat Modal (In-App)

Opens embedded chat inside modal

Uses WebView

URL:

https://mira-virtual-counselling.zapier.app
6. 🗄️ Database Schema (Neon)
Table: reports
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  type VARCHAR(10) NOT NULL, -- 'audio' or 'text'
  content TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_anonymous BOOLEAN DEFAULT true
);

CREATE INDEX idx_reports_type ON reports(type);
Data Logic
Type	Content Field Value
text	Message text
audio	Audio file URL
7. 🔌 API Design
POST /api/report

Payloads:

Text Report
{
  "type": "text",
  "content": "Suspicious activity near building",
  "is_anonymous": true
}
Audio Report

Upload file → return URL

Then:

{
  "type": "audio",
  "content": "https://server.com/uploads/audio/file123.mp3",
  "is_anonymous": true
}
POST /api/upload-audio

Accepts: multipart/form-data

Returns:

{
  "url": "https://server.com/uploads/audio/file123.mp3"
}
8. 🧠 App Logic Flow
Audio Submission Flow

Record audio

Save locally

Upload to server

Receive URL

Save to DB

Text Submission Flow

Capture input

Send directly to API

Store in DB

9. 🎨 UI/UX Guidelines (Based on Design)
Layout Sections:

Header

Logo

App Title

Subtitle

Main Action

Large red circular record button

Tap & hold interaction

Instruction Text

“Tap & hold to record, release to send”

Text Input

Rounded input field

Send icon button

Footer

Left: Phone icon

Right: Chat icon

UX Principles

Minimal steps (max 2 taps)

Large touch targets

Clear feedback (recording state)

Anonymous by default

10. 📦 Expo Setup & Build
Project Name

mirapp

Install Dependencies
npx create-expo-app mirapp
cd mirapp
npx expo install expo-av expo-file-system react-native-webview
Build Commands
npx eas-cli@latest build --platform all
CI Workflow
name: Create Production Builds

jobs:
  build_android:
    type: build
    params:
      platform: android

  build_ios:
    type: build
    params:
      platform: ios

Run:

npx eas-cli@latest workflow:run create-production-builds.yml
11. 🔐 Security Considerations

Validate file uploads (size/type)

Sanitize text input

Use HTTPS for all endpoints

Optional: rate limiting

Store minimal metadata (privacy-first)

12. 🚀 Future Enhancements

GPS location tagging (optional)

Image/video uploads

Admin dashboard (report monitoring)

AI-based threat classification

Push notifications

Twilio SMS escalation

13. ✅ MVP Scope (What to Build First)

✔ Audio recording & upload
✔ Text reporting
✔ Neon DB integration
✔ Call button
✔ Chat modal
✔ Expo build (Android first)