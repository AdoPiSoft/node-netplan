'use strict'

var fs = require('fs')
var yaml = require('js-yaml')
var config = require('./config.js')
var udev = require('../helpers/udev.js')
var util = require('util')
var readdir = util.promisify(fs.readdir)
var writeFile = util.promisify(fs.writeFile)
var ensureDir = require('make-dir')

exports.cfg_stack = {
  network: {
    version: 2,
    renderer: 'networkd'
  }
}

exports.getYamlFileName = async () => {
  await ensureDir('/etc/netplan')
  var files = await readdir('/etc/netplan')
  return '/etc/netplan/' + (files[0] || '01-networkcfg.yaml')
}

exports.setInterface = (cfg) => {
  exports.cfg_stack = config.generate(exports.cfg_stack, cfg)
}

exports.writeConfig = async () => {
  var cfg_yaml = yaml.safeDump(exports.cfg_stack, { noCompatMode: true })
  var filename = await exports.getYamlFileName()
  await ensureDir('/etc/netplan')

  await writeFile(filename, cfg_yaml)

  var udev_rules = []
  // loop ethernets and generate udev rules
  for (var eth in exports.cfg_stack.network.ethernets) {
    var cfg = exports.cfg_stack.network.ethernets[eth]
    if (cfg.mac_address) {
      udev_rules.push({
        name: eth,
        mac: cfg.mac_address
      })
    }
  }

  await udev.writeNetworkRules(udev_rules)
}

exports.configure = (configs) => {
  exports.cfg_stack.network.ethernets = {}
  exports.cfg_stack.network.vlans = {}
  exports.cfg_stack.network.bridges = {}
  configs.forEach(c => {
    var cfg = Object.assign({}, c)
    return exports.setInterface(cfg)
  })
  return exports.writeConfig()
}

