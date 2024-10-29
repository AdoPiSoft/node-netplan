'use strict'

exports.writeNetworkRules = async (configs) => {
  if (!configs) return
  if (!configs.length) return

  var rules = ''
  for (var config of configs) {
    rules += `SUBSYSTEM=="net", ACTION=="add", ATTR{address}=="${config.mac}", NAME="${config.name}"\n`
  }
  await require('fs/promises').writeFile('/etc/udev/rules.d/70-persistent-net.rules', rules)
}
