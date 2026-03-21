const { DatabaseSync } = require("node:sqlite");
const { DB_FILE } = require("../config");

const db = new DatabaseSync(DB_FILE);

module.exports = {
  db,
};
