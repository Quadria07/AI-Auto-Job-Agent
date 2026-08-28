# AI Auto Job Agent 🚀

An autonomous, production-ready AI agent that scans remote job feeds, tailors your CV & Cover Letter per job using DeepSeek AI, and applies via email (Gmail SMTP) or web forms (Puppeteer). Built with Node.js, Express, DeepSeek AI, Puppeteer, and Telegram Bot API.

## Features ✨
- 🎯 **AI Match Scoring & CV Tailoring**: Uses DeepSeek AI to analyze job descriptions, score candidate fit, and tailor CV experience bullets to match requirements while maintaining 100% truthfulness.
- 📄 **ATS Monochrome PDF Engine**: Generates single-column executive black PDF CVs with selectable text and proper document titles for ATS parsers.
- ✍️ **Automated Cover Letter Generation**: Generates 3-paragraph tailored cover letters with a formal sign-off ("Best regards, Quadri Adebisi").
- 📩 **Dual Application Delivery**:
  - **Email Applications**: Sends PDF CV & Cover Letter via Gmail SMTP directly to recruiters.
  - **Web Form Automation**: Puppeteer auto-types fields (Name, Email, Portfolio, GitHub, Cover Letter) and attaches the PDF CV on supported ATS portals (Greenhouse, Lever, Workable, Ashby, Breezy HR, Recruitee, Teamtailor).
- 📱 **Telegram Bot Integration**: Sends live match alerts, approval buttons, and daily morning digests (6:00 AM) directly to your Telegram chat.
- 🐳 **Railway / Docker Ready**: Includes `Dockerfile`, `railway.json`, and `.dockerignore` for 1-click cloud deployment.

## Tech Stack 🛠️
- **Node.js (ESM)**
- **DeepSeek API (AI Tailoring & Cover Letters)**
- **Puppeteer (Headless Browser & PDF Generation)**
- **Nodemailer (Gmail SMTP)**
- **Telegram Bot API**
- **Docker / Railway.com**

## Setup & Local Running 🚀

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Quadria07/AI-Auto-Job-Agent.git
   cd AI-Auto-Job-Agent
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment (`.env`)**:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```env
   DEEPSEEK_API_KEY=your_deepseek_key
   GMAIL_USER=quadriadebisi3@gmail.com
   GMAIL_PASS=your_gmail_app_password
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_CHAT_ID=your_telegram_chat_id
   ```

4. **Run Job Agent**:
   - **One-time Scan & Apply**:
     ```bash
     npm run scan
     ```
   - **Start 24/7 Scheduler Daemon**:
     ```bash
     npm start
     ```

## Railway Cloud Deployment ☁️
1. Connect your GitHub repository to [Railway.com](https://railway.com/).
2. Add your environment variables (`DEEPSEEK_API_KEY`, `GMAIL_USER`, `GMAIL_PASS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) in Railway project settings.
3. Railway will automatically build the `Dockerfile` and run the background scheduler 24/7!

---

*Built by [Quadri Adebisi](https://quadri-adebisi.vercel.app/)*
