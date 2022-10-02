require("dotenv").config()
const https = require("https")

// @ts-ignore
import { getJsonStructure } from "evergreen-org-crawler/build/index.js"
//TODO: Change the above library to export types

//TODO: Move this file to the crawler
import { semVerFromString, semVerToDelta } from "./semVer"

var fs = require("fs");

//Allows properties to be accessed using strings on objects with TypeScript types
function getProperty<T, K extends keyof T>(o: T, propertyName: K): T[K] {
	return o[propertyName];
}

type Config = {
	targetOrganisation: string,
	repeatOutdated: boolean
}

type RawMessageData = Map<
	string,
	{
		current: { name: string, link: string },
		deps: { latest: { name: string, link: string }, dif: number }[]
	}[]
>

//Creates a named hyperlink in the Slack API syntax
function formatLink(repo: { name: string, link: string }) {
	return `<${repo.link}|${repo.name}>`
}

//Adds a header and formats the individual dependencies
function evergreenMessage(config: Config, rawMsgData: RawMessageData) {
	const languageMap = {
		npm: "JavaScript/TypeScript",
		PyPI: "Python",
		RubyGems: "Ruby"
	}

	const blocks = []
	const divider = {"type": "divider"}

	const basicSection = function(text: string){
		return {
			"type": "section",
			"text": {
				"type": "mrkdwn",
				"text": text
			}
		}
	}

	const basicHeader = function(text: string){
		return {"type": "header", "text": {"type": "plain_text", "text": text}}
	}

	const header = "Project Evergreen :evergreen_tree: Update"

	blocks.push(basicHeader(header))
	blocks.push(basicSection("\n_Monitoring the " + config.targetOrganisation + " GitHub organisation_"))

	if (!config.repeatOutdated) {
		blocks.push(
			{
				"type": "context",
				"elements": [
					{
						"text": "Note: Dependencies which were previously reported as outdated are not shown here unless a new major version is released.",
						"type": "mrkdwn"
					}
				]
			}
		)
	}

	
	for (const [language, repos] of rawMsgData) {
		blocks.push(divider)
		const languageName = (getProperty(languageMap, language as any) || language)
		if (repos.length == 0) {
			blocks.push(basicSection("All dependencies of " + languageName + " repositories are up-to-date!"))

		} else {
			blocks.push(basicSection("For repositories written in " + languageName + ":"))
			let msg = ""
			for (const x of repos) {
				const user = x.current
				const deps = x.deps

				msg += "\tFor package " + formatLink(user) + ":\n"
				for (const dep of deps) {
					if(msg.length > 2900){
						blocks.push(basicSection(msg))
						msg = ""
					}
					msg += "\t\t- Dependency " + formatLink(dep.latest) + " is out of date by " + dep.dif + " majors.\n"
				}
				msg += "\n"
			}
			blocks.push(basicSection(msg))
		}
	}
	return {"text": header, "blocks": blocks}//,{ "text": msg }]}
}

//Calls the crawler and returns the results
async function createData(config: Config, request: "npm" | "PyPI" | "RubyGems" | null = null) {

	const requestToAPI = {
		npm: "NPM",
		PyPI: "PYPI",
		RubyGems: "RUBYGEMS"
	}

	let api = null
	if (request != null) {
		api = [getProperty(requestToAPI, request)]
	}

	const accessToken = process.env.GH_TOKEN!
	return JSON.parse(await getJsonStructure(accessToken, config, api)) //TODO: Once types are fixed, don't call the version that converts to json
}

async function main() {
	const config = JSON.parse(fs.readFileSync("config.json", "utf8")) as Config;

	const url = process.env.EVERGREEN_SLACK_WEBHOOK
	if (!url) {
		console.log("The webhook url must be defined in the .env file \"EVERGREEN_SLACK_WEBHOOK\"=[URL]")
		process.exit(1)
	}

	const data = await createData(config)

	//Internal types of data. data cannot be directly types as field names are unknown
	type DepsArray = {
		dep: number,
		dependencies: [number, string][]
	}[]

	//Internal types of data. data cannot be directly types as field names are unknown
	type DepMapType = {
		name: string,
		version: string,
		link: string
	}

	//Path to the reuslts of the last run, which prevetns repeated out-of-date messages being sent to the users Slack
	const lastRunPath = "./lastRun.json"

	//Try and load the last run. If this fails, set it to an empty object
	let inputMap: any
	try {
		inputMap = JSON.parse(fs.readFileSync(lastRunPath, "utf8"))
	} catch (e) {
		inputMap = {}
		console.log("Could not find " + lastRunPath + ". If this is not the first run, then a failure has occured.")
	}

	//Intialise the outpur for this run
	let outputMap = {
		aux: {
			orgName: config.targetOrganisation
		},
		data: {} as any
	}

	//Check if the last run used the same organisation. If it didn't, the previous results are discarded.
	if (inputMap.aux && (inputMap.aux?.orgName != outputMap.aux.orgName)) {
		inputMap = {}
		console.log("Crawling a different organisation that the last run.")
	}

	//Clear the last run if the user wants us to report all the outdated dependencies anyway
	if (config.repeatOutdated) {
		inputMap = {}
	}

	let rawMsgData: RawMessageData = new Map()

	//For each language/package manager we support...
	for (const [language, depData] of Object.entries(data)) {
		if (language == "aux" || !depData) {
			continue
		}

		rawMsgData.set(language, [])
		let curLang = rawMsgData.get(language)!

		const depMap = (depData as [any, any[]])[0]
		const depsArray = (depData as [any, any[]])[1] as DepsArray
		if (!depsArray) {
			continue
		}
		//For each module...
		for (const repo of depsArray) {
			let addedToMsg: boolean = false;

			//For each dependency
			for (const [depId, depVersion] of repo.dependencies) {
				const latest = depMap[depId] as DepMapType
				const versionDif = semVerToDelta(semVerFromString(depVersion), semVerFromString(latest.version))
				const user = depMap[repo.dep] as DepMapType

				//Only report as out-of-date if it is two majors behind
				if (versionDif.major > 1) {
					const storedName = language + "_" + latest.name + "_" + user.name
					const last = inputMap?.data ? inputMap?.data[storedName] : undefined
					outputMap.data[storedName] = { used: depVersion, latest: latest.version }
					//Only report when a dependency first goes out-of-date, assuming the import hasn't been updated
					if (last && last.used == depVersion) {
						const lastDif = semVerToDelta(semVerFromString(last.used), semVerFromString(last.latest))
						if (lastDif.major <= versionDif.major) {
							continue
						}
					}

					if (!addedToMsg) {
						curLang.push({ current: { name: user.name, link: user.link }, deps: [] })
						addedToMsg = true
					}
					curLang[curLang!.length - 1].deps.push({ latest: { name: latest.name, link: latest.link }, dif: versionDif.major })
				}
			}
		}
	}

	//Store the results of this run
	try {
		fs.writeFileSync(lastRunPath, JSON.stringify(outputMap))
	} catch (e) {
		throw new Error("Could not write to file " + lastRunPath)
	}

	//Message to send to Slack
	var postData = JSON.stringify(evergreenMessage(config, rawMsgData))

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
			if (d == "ok") {
				console.log("Sucessfully sent the message.")
			} else {
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