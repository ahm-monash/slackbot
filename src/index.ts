require("dotenv").config()
const https = require("https")

import {getJsonStructure} from "evergreen-org-crawler/src/index"

var fs = require("fs");
var config = JSON.parse(fs.readFileSync("../config.json", "utf8"));

export function getProperty<T, K extends keyof T>(o: T, propertyName: K): T[K] {
    return o[propertyName];
}

async function createData(request: "npm" | "PyPI" | "RubyGems" | null = null){
	const requestToAPI = {
		npm: "NPM",
		PyPI: "PYPI",
		RubyGems: "RUBYGEMS"
	}

	let api = null
	if(request != null){
		api = [getProperty(requestToAPI, request)]
	}

	const accessToken = process.env.EVERGREEN_GITHUB_TOKEN!
	return getJsonStructure(accessToken, config, api)
}

async function main(){
	var postData = JSON.stringify({ "text": "Hello, World! (but from a server)" })

	const url = process.env.EVERGREEN_SLACK_WEBHOOK
	if(!url){
		console.log("The webhook url must be defined in the .env file \"EVERGREEN_SLACK_WEBHOOK\"=[URL]")
		process.exit(1)
	}

	console.log(await createData())

	var options = {
		hostname: "hooks.slack.com",
		port: 443,
		path: "/services/" + url.split("/services/")[1],
		method: "POST",
		headers: {
			"Content-type": "application/json"
		}
	}

	var req = https.request(options, (res: any) => {
		res.on("data", (d: any) => {
			if(d == "ok"){
				console.log("Sucessfully sent the message.")
			} else{
				console.log("Failed to send the message:")
				console.log(d)
			}
		})
	}).on("error", (e: any) => {
		console.error(e)
	})

	req.write(postData)
	req.end()
}

main()