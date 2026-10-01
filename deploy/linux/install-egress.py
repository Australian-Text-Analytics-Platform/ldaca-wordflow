#!/usr/bin/env python3
"""Operator action: install firewall policy for the dedicated rootless Docker service UID."""
import argparse
import hashlib
import ipaddress
import json
import os
import pathlib
import pwd
import subprocess
import tempfile
import stat

parser = argparse.ArgumentParser()
parser.add_argument('service_account')
parser.add_argument('--dns', action='append', required=True, help='Exact host DNS resolver IP')
parser.add_argument('--allow-https', action='append', default=[], help='Exact internal provider IP allowed on TCP 443')
args = parser.parse_args()
if os.geteuid() != 0:
    parser.error('Run as root during deployment installation')
uid = pwd.getpwnam(args.service_account).pw_uid
if uid == 0:
    parser.error('The service account must be nonroot')
resolvers = [ipaddress.ip_address(value) for value in args.dns]
allowlist = [ipaddress.ip_address(value) for value in args.allow_https]
interfaces = json.loads(subprocess.check_output(['ip', '-json', 'address', 'show']))
host_addresses = {ipaddress.ip_address(address['local']) for interface in interfaces for address in interface.get('addr_info', [])}
rules = ['table inet wordflow {', ' chain output {', '  type filter hook output priority -10; policy accept;', f'  meta skuid {uid} ct state established,related accept']
for address in resolvers:
    family = 'ip' if address.version == 4 else 'ip6'
    for protocol in ['udp', 'tcp']:
        rules.append(f'  meta skuid {uid} {family} daddr {address} {protocol} dport 53 accept')
for address in allowlist:
    family = 'ip' if address.version == 4 else 'ip6'
    rules.append(f'  meta skuid {uid} {family} daddr {address} tcp dport 443 accept')
for address in sorted(host_addresses, key=lambda value: (value.version, int(value))):
    family = 'ip' if address.version == 4 else 'ip6'
    rules.append(f'  meta skuid {uid} {family} daddr {address} reject')
rules += [
    f'  meta skuid {uid} ip daddr {{ 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 198.18.0.0/15, 168.63.129.16/32, 224.0.0.0/4, 240.0.0.0/4 }} reject',
    f'  meta skuid {uid} ip6 daddr {{ ::/128, ::1/128, fc00::/7, fe80::/10, ff00::/8 }} reject',
    f'  meta skuid {uid} tcp dport 443 accept',
    f'  meta skuid {uid} reject', ' }', '}',
]
policy = '\n'.join(rules) + '\n'
# Replace only Wordflow's table in one nft transaction; unrelated firewall rules remain owned by the operator.
existing = subprocess.run(['nft', 'list', 'table', 'inet', 'wordflow'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
transaction = ('delete table inet wordflow\n' if existing.returncode == 0 else '') + policy
subprocess.run(['nft', '-c', '-f', '-'], input=transaction.encode(), check=True)
subprocess.run(['nft', '-f', '-'], input=transaction.encode(), check=True)
directory = pathlib.Path('/run/wordflow')
directory.mkdir(mode=0o755, exist_ok=True)
metadata = directory.lstat()
if metadata.st_uid != 0 or not stat.S_ISDIR(metadata.st_mode) or metadata.st_mode & 0o022:
    raise RuntimeError('The policy receipt directory must be a protected, root-owned directory')
os.chmod(directory, 0o755)
receipt = directory / 'egress.json'
with tempfile.NamedTemporaryFile(mode='w', dir=directory, delete=False) as staged:
    json.dump({'schemaVersion': 1, 'uid': uid, 'rulesSha256': hashlib.sha256(policy.encode()).hexdigest(), 'dns': [str(v) for v in resolvers], 'httpsAllowlist': [str(v) for v in allowlist]}, staged)
    staged.flush()
    os.fsync(staged.fileno())
    os.chmod(staged.name, 0o644)
os.replace(staged.name, receipt)
print('Installed Wordflow egress policy. Reinstall after reboot before starting the gateway.')
