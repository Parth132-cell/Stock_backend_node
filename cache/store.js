const store = {
  crypto: {},
  nifty: {},
  banknifty: {},
  metals: {}
};

const updateSection = (section, data) => {
  store[section] = data;
};

module.exports = store;
module.exports.updateSection = updateSection;