# T-blondi

Youtube data scraper

## setup

- install node.js (windows, mac, linux...)
- install dependencies by runnig: `npm i puppeteer `
- to run the program type: `node blondi.js [your query here]`

## PARAMETERS

It's is possible to choose the amount of channels you'd like to scrap. You can also apply some filters to your query. To do so, follow these steps:

- at project level, create a file called `properties.json`
- the content of the file should follow this templace:
```
{
    "minChannelAmount" : 10,
    "minSubscriptions" : 0,
    "maxSubscriptions" : 0,
    "minTotalViews" : 0,
    "maxTotalViews" : 0,
    "minAvgRecentViews" : 0,
    "maxAvgRecentViews" : 0
}
```

`minChannelAmount`: the amount of channels the script should scrap.
`minSubscriptions`: will ignore channels with fewer subscritions than this value
`maxSubscriptions`: will ignore channels with more subscritions than this value
`minTotalViews`: will ignore channels with fewer total views than this value
`maxTotalViews`: will ignore channels with more total views than this value
`minAvgRecentViews`: will ignore channels with fewer average recent views than this value
`maxAvgRecentViews`: will ignore channels with more average recent views than this value

It's possible to remove a filter by removing the line of by setting the value to `0`


## Blacklist

There are two way to blacklist channels and users, and they can be used at the same time.
If you want to blacklist by channel / user id, then:

- create a file called `blacklist.txt`
- then add to it the channels you want to ignore, like:
```
UCkGthGTWjI2awl1pqCQRncQ
UCaYLBJfw6d8XqmNlL204lNg
ESLBRASIL
```

If you want to blacklist by channel / user link, then

- create a file called `blacklist_links.txt`
- then add to it the link to the pages you want to ignore, like:
```
https://www.youtube.com/user/ThePhylol/
https://www.youtube.com/user/albertsunzheng/about
https://www.youtube.com/user/hastadpelis/about
```