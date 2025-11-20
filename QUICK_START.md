# Quick Start: Deploy to Hostinger in 10 Minutes

Follow these steps to get your Robo-Lab scanner live on Hostinger.

## ⚡ Fast Track (Recommended for Beginners)

### 1. Get Your Hostinger FTP Info (2 minutes)

1. Login to [Hostinger hPanel](https://hpanel.hostinger.com)
2. Go to **Files** → **FTP Accounts**
3. Copy these 3 things:
   - **Server/Host**: (looks like `ftp.yourdomain.com` or an IP)
   - **Username**: (your FTP username)
   - **Password**: (your FTP password)

### 2. Push Code to GitHub (3 minutes)

```bash
# In your project folder, run:
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git branch -M main
git push -u origin main
```

### 3. Add Secrets to GitHub (3 minutes)

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add these 7 secrets:

```
FTP_SERVER: (your FTP host from step 1)
FTP_USERNAME: (your FTP username from step 1)
FTP_PASSWORD: (your FTP password from step 1)

VITE_SUPABASE_URL: https://rocmqpfuazwdddvebsdo.supabase.co
VITE_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvY21xcGZ1YXp3ZGRkdmVic2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMzOTUxNDAsImV4cCI6MjA3ODk3MTE0MH0.AH6mUkWVdc9mP4_ejoxrWHCLv3cvotJ8DPpllaxUA2g

GOOGLE_PAGESPEED_API_KEY: YOUR_GOOGLE_PAGESPEED_API_KEY

OPENAI_API_KEY: YOUR_OPENAI_API_KEY
```

### 4. Upload .htaccess File (1 minute)

1. Go to Hostinger **File Manager**
2. Navigate to `public_html`
3. Upload the `.htaccess` file from your project root
   - Or create new file named `.htaccess` and paste the content from your project

### 5. Deploy! (1 minute)

```bash
# Make any small change, then push:
git add .
git commit -m "Deploy to Hostinger"
git push origin main
```

Go to GitHub → **Actions** tab and watch it deploy automatically!

Visit your domain in 2-3 minutes and your site will be live! 🎉

---

## 📋 What Happens Next?

Every time you push code to GitHub:
- GitHub Actions automatically builds your app
- Uploads it to your Hostinger VPS
- Your site updates automatically (takes 2-3 minutes)

## 🔍 Verify It's Working

1. **Check Deployment Status**:
   - GitHub repo → Actions tab → Should show green checkmark ✓

2. **Visit Your Website**:
   - Go to your domain
   - You should see the Robo-Lab scanner homepage

3. **Test a Scan**:
   - Enter a URL like `https://google.com`
   - Click "Scan Website"
   - Wait 30-60 seconds
   - You should see scan results

## ❌ Troubleshooting

### Deployment fails?
- Double-check all 7 secrets are entered correctly
- Make sure FTP credentials are correct
- Check the Actions log for error messages

### Site shows blank page?
- Check if `.htaccess` file was uploaded to `public_html`
- Clear your browser cache (Ctrl+F5 or Cmd+Shift+R)
- Check browser console (F12) for errors

### Scan doesn't work?
- Verify Supabase URL and keys are correct
- Check that OpenAI API key is valid
- Look at browser console for error messages

## 🎯 Next Steps

### For Production:
1. Set up SSL certificate (Hostinger usually auto-enables this)
2. Configure your custom domain
3. Test thoroughly on different devices

### Optional: Use SSH Instead of FTP
If you want faster, more secure deployment:
- See `DEPLOYMENT_SSH.md` for SSH setup
- SSH is recommended for production sites

## 📚 Documentation

- **Full Deployment Guide**: `DEPLOYMENT.md`
- **SSH Deployment**: `DEPLOYMENT_SSH.md`
- **Security Guide**: `SECURITY.md`

## 🆘 Need Help?

Common issues:
1. **Can't find FTP info**: Contact Hostinger support
2. **GitHub Actions failing**: Check the Actions log, it shows exactly what went wrong
3. **Site not updating**: Clear browser cache and wait 3-5 minutes
4. **Database not connecting**: Verify Supabase URL and keys match your `.env` file

---

**That's it!** Your site should now be live and auto-deploying on every push. 🚀
