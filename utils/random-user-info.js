// TODO: generate default user name with a color and an animal
const { sample } = require('lodash');

const animals = require('./animals.json')
const colors = require('./colors.json');

function getRandomUserInfo() {
  return {
    given: sample(colors),
    family: sample(animals)
  };
}

module.exports = { getRandomUserInfo };