const Sequelize = require('sequelize')

const databaseUrl = process.env.DATABASE_URL || 'postgres://localhost/spotifai'

const needsSsl =
  /sslmode=require/i.test(databaseUrl) ||
  String(process.env.DATABASE_SSL || '').toLowerCase() === 'true'

const config = {}

if (process.env.QUIET) {
  config.logging = false
}

if (needsSsl) {
  // Azure Database for PostgreSQL Flexible Server requires SSL; the pg driver
  // doesn't honor the libpq `sslmode` URL param so we set it explicitly.
  config.dialectOptions = {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  }
}

const conn = new Sequelize(databaseUrl, config)

module.exports = conn
