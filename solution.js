const $ = require("cheerio");
const axios = require('axios');
const {writeFileSync} = require('fs')
const Nightmare = require('nightmare');
const Promise = require('bluebird');

const baseUrl = 'https://www.bankmega.com/'
const targetUrl = 'https://www.bankmega.com/promolainnya.php'

async function scrapeBankMega() {
    console.log(`start getting the promos at ${Date().toString()}`);
    let categories = await getPromoCategories()
    let result = await Promise.reduce(categories, getPromoEachCategories, {}).then((res) => res);
    console.log(`done getting the promos at ${Date().toString()}`);
    return result
}

async function getPromoEachCategories(allPromos, category) {
    var nightmare = new Nightmare
    await nightmare
        .goto(targetUrl)
        .exists('#subcatpromo')
        .click(`#${category.id}`)
        .wait(2000);
    
    let result = {};
    let promoTiles = [];
    var currentPage = 1;
    var totalPage = await getTotalPage(nightmare);
    
    while(currentPage <= totalPage) {
        let promosSinglePage = await getPromosSinglePage(nightmare)
        promoTiles.push(...promosSinglePage)

        await nightmare
            .evaluate(() => {
                let pageButton = document.querySelectorAll('.page_promo_lain');
                pageButton[pageButton.length-1].click();
            }).wait(2000);
        currentPage++            
    }
    await Promise.map(promoTiles, getDetailPromo, {concurrency: 20});
    result[category.title] = promoTiles

    return {...allPromos,...result}
}

async function getDetailPromo(promo) {
    await axios.get(promo.promoUrl)
        .then((response) => {
            let promoDiv = $('#contentpromolain2', response.data).html();
            let areaPromo = $('.area', promoDiv).text().replace('Area Promo : ', '')
            let [startPeriod, endPeriod] = $('.periode', promoDiv).text().replace('Periode Promo : ', '').replace(/\t|\n/g, '').split(' - ')
            let promoImage = $('.keteranganinside img', promoDiv).attr('src');
            
            if (areaPromo) promo.areaPromo = areaPromo;
            if (startPeriod) promo.startPeriod = startPeriod;
            if (endPeriod) promo.endPeriod = endPeriod;
            if (promoImage) promo.promoImage = `${baseUrl}${promoImage}`.replace(/\s|\t|\n/g, '%20');
        }).catch((err) => {
            console.log(`Error getting the detail promo ${err}`)
        });
}

async function getPromosSinglePage(nightmare) {
    return nightmare.evaluate(() => document.querySelector('#promolain').innerHTML)
        .then((res) => {
            // console.log($('img', res).get(0).attribs.title)
            return $('img', res).get().map((val, _) => {
                let promo = {};
                if (val) {
                    if (val.attribs.title) {
                        promo.promoTitle = val.attribs.title;
                    }
                    if (val.parent && val.parent.attribs.href) {
                        promo.promoUrl = `${baseUrl}${val.parent.attribs.href}`.replace(/\s|\t|\n/g, '%20');
                    }
                    if (val.attribs.src) {
                        promo.imageUrl = `${baseUrl}${val.attribs.src}`.replace(/\s|\t|\n/g, '%20');
                    }
                }
                return promo;
            })
        });
}

async function getTotalPage(nightmare) {
    var pageDescription = await getDescriptionPage(nightmare)

    if (!pageDescription) {
        return 0
    }

    totalPage = parseInt(pageDescription.split(' ').pop())
    return totalPage
}

async function getDescriptionPage(nightmare) {
    return nightmare.evaluate(() => { 
        let node = document.querySelector('#paging1');
        if (node) {
            return node.getAttribute('title');
        } else {
            return null;
        }
    });
}

async function getPromoCategories() {
    return axios.get(targetUrl)
            .then((response) => {
                var cats = $('#subcatpromo img', response.data)
                            .get().map((val, _) => val.attribs);
                return cats
            })
            .catch((err) => {
                console.error(`error when fetching categories with error ${err}`)
            });

}

scrapeBankMega()
    .then((result) => {
        console.log(`generate output..`);
        writeFileSync('solution.json', JSON.stringify(result, null, 4));
        console.log('Done scraping');
    })
    .catch((err) => console.log(`Error while scraping: ${err}`))
    .then(() => process.exit())
