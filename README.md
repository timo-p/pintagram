# Pintagram serverless

This is the serverless api for Pintagram. http://www.pintagram.club/

## Prerequisites

You'll need some domain and a certificate in AWS certificate manager.

## Usage

1. Install dependencies
   ```
   npm install
   ```

1. Update parameters.yml
1. Create the api gateway domain

   ```
   serverless create_domain
   ```

1. Deploy the service

   ```
   serverless deploy
   ```

1. Enjoy your new api!