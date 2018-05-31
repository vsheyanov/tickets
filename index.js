const puppeteer = require('puppeteer');
const moment = require('moment');
const _ = require('lodash');


const startSearchDate = '01-09-2018';
const endSearchDate = '10-09-2018';
const traveldurations = [13, 16];
const MAX_PRICE = 50000;

// YVR - vancouver
// DUB - dublin


const destinations = [
  'HEL-YYC',
  'TLL-YYC',
  'LED-YYC',
  'MOW-YYC',
];

const excludedConnections = ['LHR', 'LGWLHR', 'EWR', 'SFO', 'SEA', 'LAX', 'JFK', 'ORD'];

// https://travel.tinkoff.ru/#/avia/results/HEL01022018AKL~AKL16022018HEL~100-E

let requests = [];
const results = [];

const startMoment = moment(startSearchDate, 'DD-MM-YYYY');
const endMoment = moment(endSearchDate, 'DD-MM-YYYY');

let tempDuration = traveldurations[0];

const PARALLEL = 7;

// https://www.aviasales.ru/search/LED0107YVR15071

destinations.forEach((d) => {
  const [airportStart, airportDestination] = d.split('-');

  const startTempMoment = startMoment.clone();

  while (startTempMoment.isBefore(endMoment)) {
    while (true) {
      const tempBackMoment = startTempMoment.clone().add(tempDuration, 'day');

      requests.push({
        code: `${airportStart}-${airportDestination} ${startTempMoment.format('DD-MM-YYYY')} - ${tempBackMoment.format('DD-MM-YYYY')}`,
        url: `https://www.aviasales.ru/search/${airportStart}${startTempMoment.format('DDMM')}${airportDestination}${tempBackMoment.format('DDMM')}1`,
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
                      return page.setViewport({ width: 1300, height: 1000 })
                          .then(() => {
                            return page;
                          })
                          .catch((error) => {
                            console.log('cannot set viewport', error);
                            return page;
                          });
                    })
                    .then((page) => {
                      page.waitForSelector('div.prediction__advice', { timeout: 90000 })

                          .then(() => {
                            return page.waitFor(500);
                          })
                          .then(() => {
                            return page.click('div.filters__item.filter.--stopover div');
                          })
                          .then(() => {
                            return page.waitFor(500);
                          })
                          .then(() => {
                            let elements = [];
                            for (var first = 0; first < 2; first++) {
                              for (var second = 0; second < 2; second++) {
                                elements.push(...excludedConnections.map(c => {
                                  return `label[for="stopover-${first}-${second}_${c}"]`;
                                }));
                              }
                            }
                            const uncheck = () => {
                              if (elements.length === 0) {
                                return Promise.resolve();
                              } else {
                                const c = elements[0];
                                elements.splice(0, 1);
                                return page.$(c)
                                    .then((el) => {
                                      if (el) {
                                        return el.click()
                                            .then(() => { return uncheck(); });
                                      } else {
                                        return uncheck();
                                      }
                                    });
                              }
                            };
                            return uncheck();
                          })
                          .then(() => {
                            return page.waitFor(500);
                          })
                          // .then(() => {
                          //   return page.screenshot({ path: `./screens/screen-${Date.now()}.jpg`, fullPage: true });
                          // })
                          .then(() => {
                            return page.$eval('div.app__content span[class="price --rub"]', e => e.innerHTML);
                          })
                          .then((valueStr) => {
                            const price = parseInt(valueStr.replace(/\s/g, '',));

                            if (price < MAX_PRICE) {
                              results.push({
                                price,
                                code: request.code,
                              });
                              console.log(`Found price ${price} for ${request.code}, ${request.url}`);
                            }
                            return page.close();
                          })
                          .then(() => {
                            resolve();
                          })
                          .catch((error) => {
                            console.log(`error in ${request.code}`, error);

                            requests.unshift(request);

                            return page.close()
                                .then(() => { resolve(); });
                          });
                      return page.goto(request.url);
                    })
                    .catch((error) => {
                      console.log('cannot create page');
                      requests.unshift(request);
                      resolve();
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
    })
    .catch((error) => {
      console.log('cannot start browser');
    });