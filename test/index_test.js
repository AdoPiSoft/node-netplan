'use strict'

var sinon = require('sinon')
var proxyquire = require('proxyquire')
var { expect } = require('chai')

describe('index.js', () => {
  var lib,
    netplan,
    child_process

  beforeEach(() => {

    netplan = { configure: sinon.fake.resolves() }
    child_process = {}

    lib = proxyquire('../src/index.js', {
      './netplan/index.js': netplan,
      'child_process': child_process
    })
  })

  describe('index.js', () => {
    it('should equal src/index.js', () => {
      var index_src = require('../src/index.js')
      var index = require('../index.js')
      expect(index_src).to.eql(index)
      expect(index.NetworkManagerBackend).to.eql('NetworkManager')
      expect(index.SystemdNetworkdBackend).to.eql('networkd')
    })
  })

  describe('setBackend()', () => {
    it('should set backend to NetworkManager', () => {
      lib.setBackend('NetworkManager')
      expect(netplan.cfg_stack.network.renderer).to.equal('NetworkManager')
    })
    it('should set backend to networkd', () => {
      lib.setBackend('networkd')
      expect(netplan.cfg_stack.network.renderer).to.equal('networkd')
    })
  })

  describe('configure()', () => {

    var restart_stub
    var restart_result
    beforeEach(() => {
      restart_result = 'ok'
      restart_stub = sinon.stub(lib, 'restartService').resolves(restart_result)
    })

    afterEach(() => {
      restart_stub.restore()
    })

    it('should order configs, physical interface first then vlans, then bridge interfaces', async () => {
      var configs = [
        { interface: 'eth0' },
        { interface: 'eth0', vlanid: 10 },
        { interface: 'br0', bridge_ports: ['eth0'] },
        { interface: 'eth1' },
        { interface: 'eth1', vlanid: 10 },
      ]
      var expected_configs = [
        { interface: 'eth0' },
        { interface: 'eth1' },
        { interface: 'eth0', vlanid: 10, ifname: 'eth0.10' },
        { interface: 'eth1', vlanid: 10, ifname: 'eth1.10' },
        { interface: 'br0', bridge_ports: ['eth0'] },
      ]
      await lib.configure(configs)
      sinon.assert.calledWithExactly(netplan.configure, expected_configs)
      expected_configs.forEach((c, i) => {
        expect(netplan.configure.firstCall.args[0][i]).to.eql(expected_configs[i])
      })
      sinon.assert.notCalled(restart_stub)
    })

    it('should reject if one interface contains conflicting vlan id', async () => {
      var configs = [
        { interface: 'eth0' },
        { interface: 'eth0', vlanid: 10, ifname: 'eth0.1' },
        { interface: 'eth1' },
        { interface: 'eth0', vlanid: 10, ifname: 'eth0.1' },
      ]
      try {
        await lib.configure(configs)
        expect.fail()
      } catch (e) {
        expect(e.message).to.equal("Can't have same VLAN ID on interface eth0")
        sinon.assert.notCalled(netplan.configure)
        sinon.assert.notCalled(restart_stub)
      }
    })

    it('should reject if bridge_ports is overlapping', async () => {
      try {
        var configs = [
          { interface: 'br0', dhcp: true, bridge_ports: ['eth0'] },
          { interface: 'br1', dhcp: true, bridge_ports: ['eth0'] },
          { interface: 'eth1', dhcp: true },
        ]
        await lib.configure(configs)
        expect.fail()
      } catch (e) {
        expect(e).to.be.an('error')
        expect(e.message).to.equal(`Interface "eth0" is bridged in "br0" and "br1"`)
      }
    })

    it('should reject if vlan has bridge_ports', async () => {
      try {
        var configs = [
          { interface: 'eth0', dhcp: true },
          { interface: 'eth1', dhcp: true, vlanid: 10, bridge_ports: ['eth0'] },
        ]
        await lib.configure(configs)
        expect.fail()
      } catch (e) {
        expect(e).to.be.an('error')
        expect(e.message).to.equal(`VLAN 10 in "eth1" cannot have bridged interfaces`)
      }
    })

    it('should set vlan ifname', async () => {
      var eth0_vlan = {
        interface: 'eth0',
        vlanid: 10,
        dhcp: true
      }
      var eth1_vlan = {
        interface: 'enx00e04c534458',
        vlanid: 10,
        dhcp: true
      }
      var configs = [eth0_vlan, eth1_vlan]
      var expected_configs = [
        { interface: 'eth0', ifname: 'eth0.10', vlanid: 10, dhcp: true },
        { interface: 'enx00e04c534458', ifname: '00e04c534458.10', vlanid: 10, dhcp: true },
      ]
      await lib.configure(configs)
      sinon.assert.calledWithExactly(netplan.configure, expected_configs)
    })

    it('should accept single config object', async () => {
      var eth0 = { interface: 'eth0', ip_address: '10.0.0.1' }
      var configs = [eth0]
      await lib.configure(eth0)
      sinon.assert.calledWithExactly(netplan.configure, configs)
      sinon.assert.notCalled(restart_stub)
    })

  })

  describe('restartService()', () => {
    it('should resolve if one service is ok', async () => {
      var error = 'some error'
      var cmds = []
      var exec_cbs = []
      var exec = sinon.fake((cmd, cb) => {
        cmds.push(cmd)
        exec_cbs.push(cb)
      })
      child_process.exec = exec

      var p = lib.restartService()

      exec_cbs[0](null)
      await Promise.resolve()

      expect(cmds[0]).to.equal('netplan apply')

      return p
    })

    it('should reject if all service failed', () => {
      var error = 'some error'
      child_process.exec = sinon.fake((cmd, cb) => cb(error))

      return lib.restartService().catch(e => {
        expect(e).to.equal(error)
      })
    })

  })

})
