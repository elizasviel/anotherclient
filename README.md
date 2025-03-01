# Game Client

A Phaser and Colyseus-based game client.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm start
```

## Deployment to Heroku

This application is configured for deployment to Heroku:

1. Create a new Heroku app:

   ```bash
   heroku create your-app-name
   ```

2. Add the Heroku remote:

   ```bash
   git remote add heroku https://git.heroku.com/your-app-name.git
   ```

3. Deploy to Heroku:

   ```bash
   git push heroku main
   ```

4. Open the deployed app:
   ```bash
   heroku open
   ```

## Troubleshooting Deployment

If you encounter issues with the deployment:

1. Check the logs:

   ```bash
   heroku logs --tail
   ```

2. Make sure all dependencies are properly installed:

   ```bash
   heroku config:set NPM_CONFIG_PRODUCTION=false
   ```

3. Restart the app:
   ```bash
   heroku restart
   ```
