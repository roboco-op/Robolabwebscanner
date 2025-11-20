# SSH-Based Deployment Setup Guide

This guide is for setting up automated deployment using SSH instead of FTP. SSH is more secure and faster.

## Prerequisites

1. GitHub account with your code repository
2. Hostinger VPS with SSH access enabled
3. SSH key pair for authentication

## Step 1: Generate SSH Key Pair

On your local machine:

```bash
# Generate a new SSH key pair (don't use a passphrase for automation)
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/hostinger_deploy

# This creates two files:
# - hostinger_deploy (private key - keep this secret!)
# - hostinger_deploy.pub (public key - upload to server)
```

## Step 2: Add Public Key to Hostinger VPS

### Option A: Using Hostinger hPanel

1. Login to Hostinger hPanel
2. Go to **Advanced** → **SSH Access**
3. Click **Manage SSH Keys**
4. Add new public key:
   ```bash
   # Copy the public key
   cat ~/.ssh/hostinger_deploy.pub
   ```
5. Paste the entire key content and save

### Option B: Using SSH (if you have existing access)

```bash
# Upload public key to server
ssh-copy-id -i ~/.ssh/hostinger_deploy.pub your-username@your-server-ip

# Or manually:
ssh your-username@your-server-ip
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Paste your public key, save and exit
chmod 600 ~/.ssh/authorized_keys
```

## Step 3: Test SSH Connection

Test that your SSH key works:

```bash
ssh -i ~/.ssh/hostinger_deploy your-username@your-server-ip
```

If successful, you should login without a password.

## Step 4: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Value | Example |
|-------------|-------|---------|
| `SSH_PRIVATE_KEY` | Your private key content | Copy entire content of `~/.ssh/hostinger_deploy` |
| `SSH_HOST` | Your server hostname/IP | `123.45.67.89` or `vps.yourdomain.com` |
| `SSH_USERNAME` | Your SSH username | `u123456789` or `root` |
| `SSH_PORT` | SSH port (usually 22) | `22` |
| `SSH_TARGET_DIR` | Target directory on server | `/home/u123456789/public_html` or `/var/www/html` |

Plus the same environment variables from the FTP setup:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GOOGLE_PAGESPEED_API_KEY`
- `OPENAI_API_KEY`

### To get your private key content:

```bash
cat ~/.ssh/hostinger_deploy
```

Copy everything including:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

## Step 5: Update Workflow File

The SSH deployment workflow is already created at `.github/workflows/deploy-ssh.yml`

To use it instead of FTP:
1. Delete or rename `.github/workflows/deploy.yml`
2. The SSH workflow will run on next push

Or keep both and choose which to use by:
- FTP: Push to `main` branch
- SSH: Manually trigger from Actions tab

## Step 6: Find Your Target Directory

SSH into your server and find the correct path:

```bash
ssh your-username@your-server-ip

# Common paths:
ls -la ~/public_html          # Hostinger shared hosting
ls -la ~/domains/yourdomain.com/public_html  # Multiple domains
ls -la /var/www/html          # VPS with Apache
ls -la /usr/share/nginx/html  # VPS with Nginx

# Use pwd to get full path
cd public_html
pwd
```

Update the `SSH_TARGET_DIR` secret with the full path.

## Step 7: Set Up Server Directory Permissions

Ensure your SSH user has write permissions:

```bash
# SSH into your server
ssh your-username@your-server-ip

# Set proper permissions
chmod 755 ~/public_html
cd ~/public_html

# Create .htaccess if it doesn't exist
cat > .htaccess << 'EOF'
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
EOF
```

## Step 8: Test Deployment

1. Make a change to your code
2. Commit and push:
   ```bash
   git add .
   git commit -m "Test SSH deployment"
   git push origin main
   ```

3. Monitor in GitHub Actions tab
4. Verify files on server:
   ```bash
   ssh your-username@your-server-ip
   ls -la ~/public_html
   ```

## Troubleshooting

### Permission Denied (publickey)

- Verify public key is added to `~/.ssh/authorized_keys` on server
- Check private key is correctly copied to GitHub Secrets
- Ensure private key has no passphrase
- Verify SSH_USERNAME is correct

### Connection Refused

- Check SSH_PORT (usually 22, some hosts use custom ports)
- Verify SSH is enabled on your Hostinger VPS
- Check firewall allows SSH connections
- Try connecting manually first: `ssh username@host -p port`

### Files Not Deploying

- Check SSH_TARGET_DIR path is correct
- Verify user has write permissions to target directory
- Check GitHub Actions logs for detailed error messages

### Server Path Not Found

SSH into server and find correct path:
```bash
ssh your-username@your-server-ip
pwd                    # Shows current directory
ls -la                 # List directories
cd public_html         # Try to navigate
pwd                    # Get full path
```

## Advantages of SSH over FTP

- **Faster**: SSH is significantly faster than FTP
- **More Secure**: Encrypted connection with key-based authentication
- **More Reliable**: Better handling of large files and interrupted transfers
- **Additional Features**: Can run commands on server before/after deployment

## Post-Deployment Commands

You can add custom commands after deployment in the workflow file:

```yaml
SCRIPT_AFTER: |
  echo "Deployment completed"
  cd ${{ secrets.SSH_TARGET_DIR }}
  # Set correct permissions
  find . -type d -exec chmod 755 {} \;
  find . -type f -exec chmod 644 {} \;
  # Clear cache if needed
  # php artisan cache:clear
  ls -la
```

## Security Best Practices

1. **Never commit private keys** - Always use GitHub Secrets
2. **Use key-based auth only** - Disable password authentication on server
3. **Restrict key permissions** - Private key should be 600 on local machine
4. **Rotate keys periodically** - Generate new keys every 6-12 months
5. **Monitor access logs** - Check server logs for unauthorized access attempts

## Switching from FTP to SSH

If you're currently using FTP deployment:

1. Set up SSH access using this guide
2. Test SSH deployment works
3. Disable or delete FTP workflow file
4. Update your documentation

Both deployment methods will work, choose based on your preference and Hostinger configuration.
