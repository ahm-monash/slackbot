How to add the Slack bot:
	- Go to "Your Apps", and click create an app
	- Select "From scratch" (at some point we'll switch to an app manifest)
	- Give the app a name, and select your workspace
	- Allow "Incoming Webhooks"
	- Install the app to a channel (preferably a new channel)
	- Go back to the "Incoming Webhooks", and copy the generated webhook url to your .env file. This should look like:
		EVERGREEN_SLACK_WEBHOOK=https://hooks.slack.com/services/X...

A .env file is required to use the app. This should only contain you webhook URL.