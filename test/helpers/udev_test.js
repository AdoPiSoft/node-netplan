'use strict'

var sinon = require('sinon')
var proxyquire = require('proxyquire')
var { expect } = require('chai')

describe("../src/udev.js", () => {

  var udev, udev_content, write_err, fs

  beforeEach(() => {
    udev_content = ''
    write_err = null

    fs = {
      readFile: sinon.fake(async () => {
        return udev_content
      }),
      writeFile: sinon.fake(async () => {
        if (write_err) {
          throw write_err
        }
      })
    }

    udev = proxyquire('../../src/helpers/udev.js', {
      'fs': { promises: fs }
    })

  })

  it('should write network udev rules', async () => {
    var configs = [{ mac: '00:11:22:33:44:55', name: 'eth0' }]
    await udev.writeNetworkRules(configs)
    var args = fs.writeFile.lastCall.args
    expect(args[0]).to.equal('/etc/udev/rules.d/70-persistent-net.rules')
    expect(args[1]).to.equal('SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="00:11:22:33:44:55", NAME="eth0"\n')
  })

  it('shold not write if no configs', async () => {
    var configs = []
    await udev.writeNetworkRules(configs)
    expect(fs.writeFile.called).to.be.false
  })

})
