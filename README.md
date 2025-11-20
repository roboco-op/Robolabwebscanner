# Robolab Web Scanner

A comprehensive automated web application analysis tool that scans websites for security vulnerabilities, performance issues, accessibility problems, and more.

## Features

- **Security Analysis**: TLS, HSTS, security headers, cookie flags, and common misconfigurations
- **Performance Metrics**: Page load time, resource counts, and optimization recommendations
- **Accessibility Audit**: WCAG compliance checks including alt text, labels, and semantic HTML
- **API Detection**: Identifies API endpoints and provides hygiene recommendations
- **E2E Insights**: Detects buttons, links, forms, and primary user actions
- **Tech Stack Detection**: Identifies frameworks and technologies used
- **Rate Limiting**: 5 scans per domain per hour to prevent abuse
- **Email Reports**: Beautiful HTML and text reports delivered via email

## Setup

### 1. Prerequisites

- Node.js 18+ installed
- Supabase account (database is pre-configured)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Email Service (Resend)

To enable real email delivery:

1. Sign up at [Resend](https://resend.com)
2. Get your API key from the dashboard
3. Add a verified domain or use the test domain `onboarding@resend.dev`
4. Configure the environment variable in your Supabase project:

**Via Supabase Dashboard:**
- Go to Project Settings → Edge Functions → Secrets
- Add: `RESEND_API_KEY` with your Resend API key

**Via Supabase CLI:**
```bash
supabase secrets set RESEND_API_KEY=re_your_api_key_here
```

**Note:** If `RESEND_API_KEY` is not configured, the application will run in mock mode and log report contents to the console instead of sending emails.

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` to use the scanner.

### 5. Build for Production

```bash
npm run build
```

## How It Works

1. **User Input**: User enters a website URL
2. **Scan Creation**: Record created in database with `pending` status
3. **Edge Function**: `web-scanner` function performs comprehensive analysis
4. **Results Storage**: Scan results stored in Supabase with overall score and top issues
5. **Preview Display**: User sees score and top 3 issues immediately
6. **Email Capture**: User enters email to receive full detailed report
7. **Report Delivery**: `send-report` function generates HTML/text report and emails it

## Database Schema

### scan_results
- Stores all scan data including status, scores, and analysis results
- Auto-expires after 30 days (unless user opts in for longer storage)
- Public read/write access for anonymous scanning

### email_submissions
- Tracks email addresses and report delivery status
- Links to scan_results via foreign key

### rate_limits
- Prevents abuse with domain-based throttling
- 5 scans per hour per domain

## Edge Functions

### web-scanner
Performs the actual website analysis:
- E2E element detection
- Security header checks
- Performance metrics
- Accessibility validation
- API endpoint detection
- Technology stack fingerprinting

### send-report
Generates and delivers email reports:
- Creates beautiful HTML report
- Includes plain text fallback
- Sends via Resend API
- Falls back to mock mode if API key not configured

## Security & Legal

- Non-intrusive scans only (GET requests, no form submissions)
- Respects robots.txt
- Rate limiting per domain
- PII redaction in stored URLs
- Results auto-expire after 30 days
- Terms of Service acceptance required

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase (Database + Edge Functions)
- **Email**: Resend
- **Scanning**: Native Fetch API with timeout controls
- **Deployment**: Supabase Edge Functions (Deno runtime)

## Development

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

### Testing Scans
Try scanning these URLs:
- `https://example.com` - Basic test site
- `https://github.com` - Modern web app
- `https://wikipedia.org` - Content-heavy site

## Troubleshooting

**"Failed to start scan"**
- Check browser console for RLS policy errors
- Verify Supabase connection in `.env` file

**"Email not received"**
- Ensure `RESEND_API_KEY` is configured in Supabase
- Check Supabase Edge Function logs for errors
- Verify email address is correct

**Scan takes too long**
- Each scan has 10-15 second timeout per check
- Some websites may be slow or block automated requests
- Check Edge Function logs for timeout errors

## License

MIT

## Support

For issues or questions, check the Edge Function logs in your Supabase dashboard.
