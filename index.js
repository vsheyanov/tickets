const puppeteer = require('puppeteer');
const moment = require('moment');
const _ = require('lodash');


const startSearchDate = '01-09-2018';
const endSearchDate = '31-10-2018';
const traveldurations = [13, 17];
const MAX_PRICE = 50000;

// YVR - vancouver
// DUB - dublin


const destinations = [
    // 'HEL-AKL',
    // 'TLL-AKL',
    // 'LED-AKL',
    'HEL-YVR',
    'TLL-YVR',
    'LED-YVR',
];

// https://travel.tinkoff.ru/#/avia/results/HEL01022018AKL~AKL16022018HEL~100-E

let requests = [];
const results = [];

const startMoment = moment(startSearchDate, 'DD-MM-YYYY');
const endMoment = moment(endSearchDate, 'DD-MM-YYYY');

let tempDuration = traveldurations[0];

const PARALLEL = 8;


destinations.forEach((d) => {
  const [airportStart, airportDestination] = d.split('-');

  const startTempMoment = startMoment.clone();

  while (startTempMoment.isBefore(endMoment)) {
    while (true) {
      const tempBackMoment = startTempMoment.clone().add(tempDuration, 'day');


      requests.push({
        code: `${airportStart}-${airportDestination} ${startTempMoment.format('DD-MM-YYYY')} - ${tempBackMoment.format('DD-MM-YYYY')}`,
        url: `https://travel.tinkoff.ru/#/avia/results/${airportStart}${startTempMoment.format('DDMMYYYY')}${airportDestination}~${airportDestination}${tempBackMoment.format('DDMMYYYY')}${airportStart}~100-E`,
      });


      tempDuration++;
      if (tempDuration > traveldurations[traveldurations.length - 1]) {
        tempDuration = traveldurations[0];
        break;
      }
    }

    startTempMoment.add(1, 'day');
  }
});

console.log(`${requests.length} requests, approx ${requests.length / 3 / PARALLEL} minutes`);

puppeteer.launch()
    .then((browser) => {
      function iterate() {

        const bunch = _.take(requests, PARALLEL);
        requests = _.without(requests, ...bunch) || [];

        Promise.all(_.map(bunch, (request) => {
              return new Promise((resolve) => {
                Promise.resolve()
                    .then(() => {
                      return browser.newPage();
                    })
                    .then((page) => {
                      page
                          .waitForSelector('button[class="ak-Button ak-Button--primary ak-Button--block"]', {timeout: 90000})
                          .then(() => {
                            return page.waitFor(1000);
                          })
                          .then(() => {
                            return page.$eval('.ak-Price__Value', e => e.innerHTML);
                          })
                          .then((valueStr) => {
                            const price = parseInt(valueStr.replace(/\s/g, '',));

                            if (price < MAX_PRICE) {
                              results.push({
                                price,
                                code: request.code,
                              });
                              console.log(`Found price ${price} for ${request.code}`)
                            }

                            return page.close();
                          })
                          .then(() => {
                            resolve();
                          })
                          .catch((error) => {
                            console.log(`error in ${request.code}`);

                            requests.unshift(request);

                            return page.close()
                                .then(() => { resolve(); });
                          });

                      return page.goto(request.url);
                    });
              });
            }))
            .then(() => {
              if (requests.length > 0) {
                iterate()
              } else {
                browser.close();

                const sorted = _.sortBy(results, 'price');
                console.log('final result:');

                sorted.forEach((result) => {
                  console.log(`${result.price} - ${result.code}`)
                });

              }
            });
      }

      iterate();
    });