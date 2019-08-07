const puppeteer = require('puppeteer');
const fs = require('fs');
const blacklist = require('./util/blacklist');
const yt = require('./util/youtube');
const exporter = require('./util/export');
const template = require('./util/template');

var properties = {}

if (fs.existsSync('./properties.json')) {
    properties = require('./properties.json');
} else {
    properties = {}
}

const blacklistedIds = blacklist.getBlacklistedChannelIds()
const blacklistedNames = blacklist.getBlacklistedChannelLinks()
const blacklisted = blacklistedIds.concat(blacklistedNames)

const minChannelAmount = properties.minChannelAmount || 20 // default value
const minSubscriptions = properties.minSubscriptions
const maxSubscriptions = properties.maxSubscriptions
const minTotalViews = properties.minTotalViews
const maxTotalViews = properties.maxTotalViews
const minAvgRecentViews = properties.minAvgRecentViews
const maxAvgRecentViews = properties.maxAvgRecentViews

var browser;

(async () => {

    const searchQuery = process.argv.slice(2).toString().split(",").join("+")
    const channelSearch = yt.getQueryUrl(searchQuery)
    const baseFileName = JSON.stringify(process.argv.slice(2).toString().split(",").join("_")).replace(/\W/g, '')

    browser = await puppeteer.launch({
        args: ['--lang=en']
    })

    //This one will be used to search the channels...
    const channelsPage = await browser.newPage()

    // ... and this one will navigate to each channel page to extrat data
    const dataPage = await browser.newPage()

    //Stores data which will be exported at the end
    const data = []

    //Searching for channels for given query
    await channelsPage.goto(channelSearch)
    await channelsPage.screenshot({path: 'screenshots/channels.png'})

    var channelIndex = 0

    //to get outside of this loop, I'm checking if I have enough items at the end of it
    while (true) {

        var channels = await channelsPage.evaluate(querySelector => {
            const elements = document.querySelectorAll(querySelector)
            const output = []
            for (var i = 0; i < elements.length; i++) {
                output.push(elements[i].href)
            }
            return output
        }, yt.channelQuerySelector)

        console.log(`found ${channels.length} channels...`)
        
        //Iterate over channels we found. ignore blacklisted, apply filters and so on
        for (; channelIndex < channels.length; channelIndex++) {
            try {
                channel = channels[channelIndex]
                const splitted = channel.split("/")
                //filter blacklisted channels
                if (blacklisted.includes(splitted[splitted.length-1])) {
                    console.log(`${channel} is blacklisted`)
                } else {
                    //Navigate to about page...
                    console.log(`extracting data from ${channel}`)
                    console.log("...about")
                    await dataPage.goto(yt.getAboutPage(channel))

                    //Scrolling up so it'll load the header elements
                    await dataPage.evaluate(() => {
                        window.scrollBy(0, -1000)
                    })

                    //Extracting data from "about" page
                    var aboutPageData = await dataPage.evaluate(selectors => {

                        function getChannelId() {
                            var result = null
                            var link = document.querySelector("link[rel='alternate']")
                            if (link) {
                                var href = link.href
                                if (href) {
                                    var chunks = href.split("/")
                                    result = chunks[chunks.length - 1]
                                }
                            }
                            return result
                        }

                        const output = {}
                        
                        //title
                        titleElement = document.querySelector(selectors.divTitle) || document.querySelector(selectors.spanTitle) || { innerText: "---" }
                        output.title = titleElement.innerText

                        //subscriptions
                        const subCounter =  document.querySelector(selectors.subscribersCount)
                        if (subCounter) {
                            subsCounterText = subCounter.innerHTML
                            if (subsCounterText) {
                                output.subscriptions = subsCounterText.split(" ")[0].split(",").join("")
                            }
                        }

                        //views
                        const rightColumnElements = document.querySelectorAll(selectors.rightColumn)
                        for (i = 0; i < rightColumnElements.length; i++) {
                            const elementText = rightColumnElements[i].innerText
                            if (elementText.endsWith("views")) {
                                output.views = elementText.split(" ")[0].split(",").join("")
                                break
                            }
                        }

                        output.channelId = getChannelId()

                        return output
                
                    }, yt.channelAboutSelectors)

                    aboutPageData.handle = yt.getUserHandle(dataPage.url())

                    // Applying filters
                    if (minSubscriptions)
                        if (aboutPageData.subscriptions < minSubscriptions){
                            console.log("too few subscriptions")
                            continue
                        }
                    
                    if (maxSubscriptions)
                        if (aboutPageData.subscriptions > maxSubscriptions) {
                            console.log("too many subscriptions")
                            continue
                        }

                    if (minTotalViews)
                        if (!aboutPageData.views || aboutPageData.views < minTotalViews) {
                            console.log("too few total views")
                            continue
                        }

                    if (maxTotalViews)
                        if (!aboutPageData.views || aboutPageData.views > maxTotalViews) {
                            console.log("too many total views")
                            continue
                        }


                    console.log("...videos")
                    //Navigate to "videos" page
                    await dataPage.goto(yt.getVideosPage(channel))
                    //Extracting lastest videos data
                    var videoPageData = await dataPage.evaluate(() => {

                        function median(values) {
                            values.sort()
                            var median
                            if (values.length % 2) {
                                median = values[(values.length-1) / 2]
                            } else {
                                median = (values[values.length/2-1] + values[values.length/2])/2
                            }
                            return median
                        }

                        //convert views count string to integer value
                        function parseViews(value) {
                            if (value.endsWith("K")) {
                                value = value.slice(0, -1)
                                return value * 1000
                            } else if (value.endsWith("M")) {
                                value = value.slice(0, -1)
                                return value * 1000000
                            } else if (value.endsWith("B")) {
                                value = value.slice(0, -1)
                                return value * 1000000000
                            } else if (isNaN(value)) {
                                return 0 //unexpected value
                            } else {
                                return value * 1 // to int???
                            }
                        }

                        //convert upload data string to int (months)
                        function parseUploadDateInMonths(value) {
                            var chuncks = value.split(" ")
                            if (chuncks.length == 3 && chuncks[2] == "ago") {
                                return chuncks[0] * getFactorForTimeUnit(chuncks[1])
                            }
                            return 0
                        }

                        function getFactorForTimeUnit(unit) {
                            if (unit.startsWith("month")) {
                                return 1
                            } else if (unit.startsWith("year")) {
                                return 12
                            } else {
                                return 0
                            }
                        }

                        // get "46k views" (for instance) span
                        const viewLabels = document.querySelectorAll("ytd-grid-video-renderer #metadata-line span:first-child")
                        if (viewLabels.length > 0) {
                            var min = Number.MAX_SAFE_INTEGER
                        } else {
                            var min = 0
                        }

                        //const dataLabel = document.querySelectorAll("ytd-grid-video-renderer #metadata-line span:nth-child(2)")

                        var max = 0
                        var sum = 0
                        var labels = []
                        var viewValues = []
                        for (i = 0; i < viewLabels.length; i++) {
                            
                            const label = viewLabels[i].innerText
                            labels.push(label)
                            const viewCount = parseViews(label.split(" ")[0])
                            viewValues.push(viewCount)
                            sum += viewCount
                            
                            if (viewCount > max) {
                                max = viewCount
                            }

                            if (viewCount < min) {
                                min = viewCount
                            }
                        }

                        const avg = sum / viewLabels.length

                        return {
                            "labels": labels,
                            "mostPop": max,
                            "leastPop": min,
                            "average": Math.round(avg),
                            "median": median(viewValues),
                            "sum" : sum,
                            "count": viewLabels.length
                        }
                    })

                    //Applying filters again
                    if (minAvgRecentViews)
                        if (!videoPageData.average || videoPageData.average < minAvgRecentViews) {
                            console.log("too few average recent views")
                            continue
                        }

                    if (maxAvgRecentViews)
                        if (!videoPageData.average || videoPageData.average > maxAvgRecentViews) {
                            console.log("too many average recent views")
                            continue
                        }

                    data.push({
                        aboutPageData: aboutPageData,
                        videoPageData: videoPageData,
                        channel: channel
                    })

                    //If there are enough items, stop scraping
                    if (data.length == minChannelAmount) {
                        break
                    }
                }
            } catch (ex) {
                console.log("oops: " + ex)
            }
        }

        //now we check if there if there're enough items and, if not, scroll down so we can load more
        if (data.length < minChannelAmount) {
            previousHeight = await channelsPage.evaluate('document.querySelector("ytd-app").scrollHeight')
            await channelsPage.evaluate('window.scrollTo(0, document.querySelector("ytd-app").scrollHeight)')
            try {
                await channelsPage.waitForFunction(`document.querySelector("ytd-app").scrollHeight > ${previousHeight}`, {timeout: 10000})
            } catch(ex) {
                console.log("Not enough items. Scraping is over")
                break
            }
        } else {
            break
        }
    
    }


    //Exporting data into csv file
    var exportableData = []
    var defaultFields = ["Influencer", "subs_count", "view_count", "most_views_recent", "least_views_recent", "avg_view", "median_views", "about_link", "customURL", "channel_id"]
    var templateFields = template.getTemplate()
    
    for (i = 0; i < data.length; i++) {
        const channelData = data[i]
        var exportable = {}
        exportable.Influencer = channelData.aboutPageData.title.split(",").join(" ")

        if (channelData.aboutPageData.subscriptions)
            exportable.subs_count = channelData.aboutPageData.subscriptions.split(",").join("")

        if (channelData.aboutPageData.views)
            exportable.view_count = channelData.aboutPageData.views.split(",").join("")

        const recentViews = channelData.videoPageData || {}

        if (recentViews.mostPop) {
            exportable.most_views_recent = recentViews.mostPop
        }

        if (recentViews.leastPop) {
            exportable.least_views_recent = recentViews.leastPop
        }

        if (recentViews.average) {
            exportable.avg_view = recentViews.average
        }

        if (recentViews.median) {
            exportable.median_views = recentViews.median
        }

        if (channelData.aboutPageData.handle) {
            exportable.customURL = channelData.aboutPageData.handle
        }

        if (channelData.aboutPageData.channelId) {
            exportable.channel_id = channelData.aboutPageData.channelId
        }

        exportable.about_link = channelData.channel
        exportableData.push(exportable)
    }

    exporter.exportData(`./output/${baseFileName}.csv`, exportableData, defaultFields)

    if (templateFields && templateFields.length > 0) {
        exporter.exportData(`./output/${baseFileName}_formatted.csv`, exportableData, templateFields)
    }

    browser.close()
})()