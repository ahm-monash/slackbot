# Slack Bot
This repository is an add-on for the Evergreen dashboard (https://github.com/ahm-monash/evergreen) which allows for the integration of slack notifications for your organisation. 
## How to add the Slack Bot
To integrate the Slack Bot with the dashboard:
1. Go to *Your Apps* for slack (https://api.slack.com/apps/), and Select *Create an App*.
2. Select *From scratch* (at some point we'll switch to an app manifest).
3. Give the app a name and select the workspace you wish to use.
4. Allow *Incoming Webhooks*.
5. Install the app to a channel (preferably a new channel).
6. Return to the *Incoming Webhooks* and copy the generated webhook url to your .env file. This should look like: `EVERGREEN_SLACK_WEBHOOK=https://hooks.slack.com/services/X...`

A .env file is required to use the app. This should only contain your webhook URL.