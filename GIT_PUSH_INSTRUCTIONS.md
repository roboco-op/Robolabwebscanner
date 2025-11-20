# Push to GitHub Instructions

Your code is now committed locally. To push to GitHub, follow these steps:

## Option 1: If You Have an Existing GitHub Repository

```bash
# Add your repository as remote (replace with your actual repo URL)
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git

# Push to GitHub
git push -u origin main
```

## Option 2: If You Need to Create a New GitHub Repository

### Step 1: Create Repository on GitHub
1. Go to https://github.com/new
2. Name your repository (e.g., "robolab-scanner")
3. Choose Public or Private
4. **DO NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

### Step 2: Push Your Code
After creating the repo, GitHub will show you commands. Use these:

```bash
# Add your new repository as remote
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git

# Push your code
git push -u origin main
```

## What Happens After Push?

Once you push to GitHub:

1. **GitHub Actions will automatically run** (if you set up secrets)
   - Builds your project
   - Deploys to Hostinger via FTP or SSH

2. **You need to add GitHub Secrets** for deployment to work:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add the 7 secrets listed in `QUICK_START.md`

## Example Commands

Replace `yourusername` and `robolab-scanner` with your actual values:

```bash
git remote add origin https://github.com/yourusername/robolab-scanner.git
git push -u origin main
```

## Verify Success

After pushing, check:
1. Your code appears on GitHub
2. Go to the "Actions" tab to see deployment workflow running
3. Wait for green checkmark (deployment succeeded)
4. Visit your website to see the changes live

## Future Updates

After the initial push, you can update with:

```bash
git add -A
git commit -m "Your update message"
git push origin main
```

Every push to `main` branch will automatically deploy to Hostinger!

## Need Help?

If you get errors:
- Make sure you created the GitHub repository
- Check that the remote URL is correct: `git remote -v`
- Verify you have push access to the repository
- You may need to authenticate (GitHub will prompt you)
