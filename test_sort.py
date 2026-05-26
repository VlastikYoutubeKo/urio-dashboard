import json
data = [{"code":"ae","current":25,"deltas":{"24h":0}}, {"code":"am","current":2,"deltas":{"24h":0}}, {"code":"ar","current":27,"deltas":{"24h":0}}]
sorted_countries = sorted(data, key=lambda x: (x['deltas'].get('24h', 0), x.get('current', 0)), reverse=True)
print([x['code'] for x in sorted_countries])
