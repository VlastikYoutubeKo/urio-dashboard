from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
import sqlite3
from backend.models import db

provider_bp = Blueprint('provider', __name__, url_prefix='/api/provider')

REGIONS = {
    'us': 'North America', 'ca': 'North America', 'mx': 'North America',
    'gb': 'Europe', 'de': 'Europe', 'fr': 'Europe', 'es': 'Europe', 'fi': 'Europe',
    'nl': 'Europe', 'se': 'Europe', 'no': 'Europe', 'dk': 'Europe', 'it': 'Europe',
    'pl': 'Europe', 'cz': 'Europe', 'at': 'Europe', 'ch': 'Europe', 'be': 'Europe',
    'ie': 'Europe', 'pt': 'Europe', 'ru': 'Europe', 'ua': 'Europe', 'ro': 'Europe',
    'bg': 'Europe', 'hu': 'Europe', 'lt': 'Europe', 'lv': 'Europe', 'sk': 'Europe',
    'hr': 'Europe', 'rs': 'Europe', 'md': 'Europe', 'by': 'Europe', 'is': 'Europe',
    'lu': 'Europe', 'mt': 'Europe', 'si': 'Europe', 'cy': 'Europe', 'gr': 'Europe',
    'mk': 'Europe', 'al': 'Europe', 'ba': 'Europe', 'am': 'Europe', 'ge': 'Europe',
    'kz': 'Europe', 'az': 'Europe', 'xk': 'Europe', 'ee': 'Europe', 'li': 'Europe',
    'mc': 'Europe', 'ad': 'Europe', 'tr': 'Europe',
    'vn': 'Asia-Pacific', 'sg': 'Asia-Pacific', 'hk': 'Asia-Pacific', 'kr': 'Asia-Pacific',
    'in': 'Asia-Pacific', 'jp': 'Asia-Pacific', 'th': 'Asia-Pacific', 'my': 'Asia-Pacific',
    'id': 'Asia-Pacific', 'ph': 'Asia-Pacific', 'cn': 'Asia-Pacific', 'tw': 'Asia-Pacific',
    'bd': 'Asia-Pacific', 'kh': 'Asia-Pacific', 'mn': 'Asia-Pacific', 'mm': 'Asia-Pacific',
    'la': 'Asia-Pacific', 'nz': 'Asia-Pacific', 'au': 'Asia-Pacific', 'lk': 'Asia-Pacific',
    'np': 'Asia-Pacific', 'uz': 'Asia-Pacific', 'tj': 'Asia-Pacific', 'kg': 'Asia-Pacific',
    'pk': 'Asia-Pacific', 'ir': 'Middle East',
    'ae': 'Middle East', 'sa': 'Middle East', 'il': 'Middle East', 'jo': 'Middle East',
    'qa': 'Middle East', 'kw': 'Middle East', 'iq': 'Middle East', 'sy': 'Middle East',
    'lb': 'Middle East', 'ps': 'Middle East', 'bh': 'Middle East', 'om': 'Middle East',
    'br': 'South America', 'ar': 'South America', 'co': 'South America', 'cl': 'South America',
    'pe': 'South America', 'uy': 'South America', 'py': 'South America', 'ec': 'South America',
    'bo': 'South America', 've': 'South America', 'cr': 'South America', 'pa': 'South America',
    'hn': 'South America', 'gt': 'South America', 'jm': 'South America', 'do': 'South America',
    'pr': 'South America', 'ky': 'South America', 'bs': 'South America', 'vi': 'South America',
    'bq': 'South America', 'tt': 'South America', 'gd': 'South America',
    'ng': 'Africa', 'ma': 'Africa', 'ke': 'Africa', 'za': 'Africa', 'sn': 'Africa',
    'tz': 'Africa', 'ug': 'Africa', 'mz': 'Africa', 'gh': 'Africa', 'cd': 'Africa',
    'et': 'Africa', 'ga': 'Africa', 'ci': 'Africa', 'tn': 'Africa', 'eg': 'Africa',
    'ly': 'Africa', 'dz': 'Africa', 'mu': 'Africa', 'bw': 'Africa',
}

def get_db():
    conn = db.engine.raw_connection()
    conn.row_factory = sqlite3.Row
    return conn

@provider_bp.route('/summary')
def api_summary():
    conn = get_db()
    cursor = conn.cursor()
    
    # Current totals
    cursor.execute("SELECT MAX(timestamp) as latest FROM provider_counts")
    latest_row = cursor.fetchone()
    latest = latest_row['latest'] if latest_row and latest_row['latest'] else None
    
    if not latest:
        conn.close()
        return jsonify({'timestamp': None, 'total': 0, 'hour_delta': 0, 'day_delta': 0, 'top_10': []})
        
    cursor.execute("""
        SELECT SUM(provider_count) as total FROM provider_counts 
        WHERE timestamp = ?
    """, (latest,))
    current_total = cursor.fetchone()['total'] or 0
    
    # Hour-over-hour delta
    hour_ago = (datetime.fromisoformat(latest) - timedelta(hours=1)).isoformat(sep=' ')
    cursor.execute("""
        SELECT SUM(provider_count) as total FROM provider_counts 
        WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1
    """, (hour_ago,))
    hour_ago_row = cursor.fetchone()
    hour_ago_total = hour_ago_row['total'] if hour_ago_row and hour_ago_row['total'] is not None else current_total
    hour_delta = current_total - hour_ago_total
    
    # Day-over-day delta
    day_ago = (datetime.fromisoformat(latest) - timedelta(days=1)).isoformat(sep=' ')
    cursor.execute("""
        SELECT SUM(provider_count) as total FROM provider_counts 
        WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1
    """, (day_ago,))
    day_ago_row = cursor.fetchone()
    day_ago_total = day_ago_row['total'] if day_ago_row and day_ago_row['total'] is not None else current_total
    day_delta = current_total - day_ago_total
    
    # Top 10
    cursor.execute("""
        SELECT country_name, country_code, provider_count
        FROM provider_counts WHERE timestamp = ?
        ORDER BY provider_count DESC LIMIT 10
    """, (latest,))
    top_10 = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify({
        'timestamp': latest,
        'total': current_total,
        'hour_delta': hour_delta,
        'day_delta': day_delta,
        'top_10': top_10
    })

@provider_bp.route('/network_total')
def api_network_total():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT timestamp, SUM(provider_count) as total
        FROM provider_counts
        GROUP BY timestamp
        ORDER BY timestamp DESC LIMIT 720
    """)
    data = [{'timestamp': row[0], 'total': row[1]} for row in cursor.fetchall()]
    data.reverse()

    # Add 24-hour moving average
    window = 24
    for i, row in enumerate(data):
        start = max(0, i - window + 1)
        row['ma'] = round(sum(d['total'] for d in data[start:i+1]) / (i - start + 1))

    conn.close()
    return jsonify(data)

@provider_bp.route('/movers')
def api_movers():
    conn = get_db()
    cursor = conn.cursor()
    
    latest_row = cursor.execute("SELECT MAX(timestamp) FROM provider_counts").fetchone()
    if not latest_row or not latest_row[0]:
        conn.close()
        return jsonify({})
    latest = latest_row[0]
        
    hour_ago = (datetime.fromisoformat(latest) - timedelta(hours=1)).isoformat(sep=' ')
    day_ago = (datetime.fromisoformat(latest) - timedelta(days=1)).isoformat(sep=' ')
    week_ago = (datetime.fromisoformat(latest) - timedelta(days=7)).isoformat(sep=' ')
    
    movers = {}
    for window, since in [('1h', hour_ago), ('24h', day_ago), ('7d', week_ago)]:
        cursor.execute(f"""
            WITH current AS (
                SELECT country_code, country_name, provider_count 
                FROM provider_counts WHERE timestamp = ?
            ),
            past AS (
                SELECT country_code, provider_count 
                FROM provider_counts 
                WHERE timestamp = (
                    SELECT MIN(timestamp) FROM provider_counts WHERE timestamp >= ?
                )
            )
            SELECT c.country_name, c.country_code, c.provider_count,
                   c.provider_count - COALESCE(p.provider_count, 0) as delta
            FROM current c
            LEFT JOIN past p ON c.country_code = p.country_code
            ORDER BY delta DESC
        """, (latest, since))
        gainers = [dict(row) for row in cursor.fetchmany(10)]
        
        cursor.execute(f"""
            WITH current AS (
                SELECT country_code, country_name, provider_count 
                FROM provider_counts WHERE timestamp = ?
            ),
            past AS (
                SELECT country_code, provider_count 
                FROM provider_counts 
                WHERE timestamp = (
                    SELECT MIN(timestamp) FROM provider_counts WHERE timestamp >= ?
                )
            )
            SELECT c.country_name, c.country_code, c.provider_count,
                   c.provider_count - COALESCE(p.provider_count, 0) as delta
            FROM current c
            LEFT JOIN past p ON c.country_code = p.country_code
            ORDER BY delta ASC
        """, (latest, since))
        losers = [dict(row) for row in cursor.fetchmany(10)]
        
        movers[window] = {'gainers': gainers, 'losers': losers}
    
    conn.close()
    return jsonify(movers)

@provider_bp.route('/anomalies')
def api_anomalies():
    conn = get_db()
    cursor = conn.cursor()

    threshold_pct = float(request.args.get('threshold', 15))
    threshold = threshold_pct / 100

    latest_row = cursor.execute("SELECT MAX(timestamp) FROM provider_counts").fetchone()
    if not latest_row or not latest_row[0]:
        conn.close()
        return jsonify({'anomalies': [], 'threshold': threshold})
    latest = latest_row[0]
        
    hour_ago = (datetime.fromisoformat(latest) - timedelta(hours=1)).isoformat(sep=' ')

    cursor.execute("""
        WITH current AS (
            SELECT country_code, country_name, provider_count
            FROM provider_counts WHERE timestamp = ?
        ),
        past AS (
            SELECT country_code, provider_count
            FROM provider_counts
            WHERE timestamp = (
                SELECT MAX(timestamp) FROM provider_counts WHERE timestamp <= ?
            )
        )
        SELECT c.country_name, c.country_code, c.provider_count,
               COALESCE(c.provider_count - p.provider_count, 0) as delta,
               CASE WHEN p.provider_count > 0
                    THEN CAST(c.provider_count - p.provider_count AS FLOAT) / p.provider_count * 100
                    ELSE 0 END as pct_change
        FROM current c
        LEFT JOIN past p ON c.country_code = p.country_code
        WHERE ABS(CAST(c.provider_count - p.provider_count AS FLOAT) / NULLIF(p.provider_count, 0)) > ?
        ORDER BY ABS(pct_change) DESC
    """, (latest, hour_ago, threshold))

    anomalies = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify({'anomalies': anomalies, 'threshold': threshold})

@provider_bp.route('/growth-projection')
def api_growth_projection():
    conn = get_db()
    cursor = conn.cursor()

    latest_row = cursor.execute("SELECT MAX(timestamp) FROM provider_counts").fetchone()
    if not latest_row or not latest_row[0]:
        conn.close()
        return jsonify({})
    latest = latest_row[0]
        
    day_ago = (datetime.fromisoformat(latest) - timedelta(days=1)).isoformat(sep=' ')

    cursor.execute("SELECT SUM(provider_count) as total FROM provider_counts WHERE timestamp = ?", (latest,))
    current = cursor.fetchone()['total'] or 0

    cursor.execute("SELECT SUM(provider_count) as total FROM provider_counts WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1", (day_ago,))
    past_row = cursor.fetchone()
    past = past_row['total'] if past_row and past_row['total'] is not None else current

    daily_growth = current - past
    growth_rate = (daily_growth / past * 100) if past > 0 else 0

    capped_growth = max(-1000, min(1000, daily_growth))
    projected_30d = int(current + (capped_growth * 30))
    projected_90d = int(current + (capped_growth * 90))

    conn.close()
    return jsonify({
        'current': current,
        'daily_growth': daily_growth,
        'growth_rate': max(-100, min(100, growth_rate)),
        'projected_30d': max(0, projected_30d),
        'projected_90d': max(0, projected_90d)
    })

@provider_bp.route('/churn/<code>')
def api_churn(code):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT timestamp, provider_count
        FROM provider_counts
        WHERE country_code = ?
        ORDER BY timestamp DESC LIMIT 24
    """, (code.lower(),))

    data = [{'timestamp': row[0], 'count': row[1]} for row in cursor.fetchall()]
    data.reverse()

    if len(data) < 2:
        conn.close()
        return jsonify({'churn_rate': 0, 'volatility': 'N/A', 'data': data})

    changes = [abs(data[i+1]['count'] - data[i]['count']) for i in range(len(data)-1)]
    avg_change = sum(changes) / len(changes) if changes else 0
    volatility = 'high' if avg_change > 100 else 'medium' if avg_change > 50 else 'low'

    conn.close()
    return jsonify({'churn_rate': avg_change, 'volatility': volatility, 'data': data})

@provider_bp.route('/country-stats/<code>')
def api_country_stats(code):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT timestamp, provider_count
        FROM provider_counts
        WHERE country_code = ?
        ORDER BY timestamp DESC LIMIT 24
    """, (code.lower(),))

    data = [{'timestamp': row[0], 'count': row[1]} for row in cursor.fetchall()]
    data.reverse()

    if len(data) < 2:
        conn.close()
        return jsonify({'volatility': 'N/A', 'churn_rate': 0})

    changes = [abs(data[i+1]['count'] - data[i]['count']) for i in range(len(data)-1)]
    avg_change = sum(changes) / len(changes) if changes else 0
    volatility = 'high' if avg_change > 100 else 'medium' if avg_change > 50 else 'low'

    conn.close()
    return jsonify({'volatility': volatility, 'churn_rate': round(avg_change, 1)})

@provider_bp.route('/regions')
def api_regions():
    conn = get_db()
    cursor = conn.cursor()

    latest_row = cursor.execute("SELECT MAX(timestamp) FROM provider_counts").fetchone()
    if not latest_row or not latest_row[0]:
        conn.close()
        return jsonify([])
    latest = latest_row[0]
        
    day_ago = (datetime.fromisoformat(latest) - timedelta(days=1)).isoformat(sep=' ')

    cursor.execute("""
        SELECT country_code, provider_count
        FROM provider_counts WHERE timestamp = ?
    """, (latest,))
    current_by_country = {row[0]: row[1] for row in cursor.fetchall()}

    cursor.execute("""
        SELECT country_code, provider_count
        FROM provider_counts
        WHERE timestamp = (
            SELECT MAX(timestamp) FROM provider_counts WHERE timestamp <= ?
        )
    """, (day_ago,))
    past_by_country = {row[0]: row[1] for row in cursor.fetchall()}

    regions_data = {}
    for cc, current_count in current_by_country.items():
        region = REGIONS.get(cc, 'Other')
        if region not in regions_data:
            regions_data[region] = {'total': 0, 'past_total': 0}
        regions_data[region]['total'] += current_count
        regions_data[region]['past_total'] += past_by_country.get(cc, current_count)

    result = []
    for region, data in regions_data.items():
        delta = data['total'] - data['past_total']
        result.append({
            'region': region,
            'total': data['total'],
            'delta_24h': delta
        })

    result.sort(key=lambda x: x['total'], reverse=True)
    conn.close()
    return jsonify(result)

@provider_bp.route('/at-risk')
def api_at_risk():
    conn = get_db()
    cursor = conn.cursor()

    latest_row = cursor.execute("SELECT MAX(timestamp) FROM provider_counts").fetchone()
    if not latest_row or not latest_row[0]:
        conn.close()
        return jsonify({'disappeared': [], 'near_zero': []})
    latest = latest_row[0]
        
    day_ago = (datetime.fromisoformat(latest) - timedelta(days=1)).isoformat(sep=' ')

    cursor.execute("""
        SELECT c.country_code, c.country_name,
               p.provider_count as prev_count, p.timestamp as last_seen_ts
        FROM (
            SELECT DISTINCT country_code, country_name FROM provider_counts WHERE timestamp = ? AND provider_count = 0
        ) c
        LEFT JOIN (
            SELECT country_code, provider_count, timestamp FROM provider_counts
            WHERE timestamp <= ? AND provider_count > 0
            ORDER BY country_code, timestamp DESC
        ) p ON c.country_code = p.country_code
        WHERE p.provider_count > 0
    """, (latest, day_ago))
    disappeared = [dict(row) for row in cursor.fetchall()]

    cursor.execute("""
        WITH current AS (
            SELECT country_code, country_name, provider_count
            FROM provider_counts WHERE timestamp = ? AND provider_count BETWEEN 1 AND 5
        ),
        past AS (
            SELECT country_code, provider_count
            FROM provider_counts
            WHERE timestamp = (
                SELECT MAX(timestamp) FROM provider_counts WHERE timestamp <= ?
            )
        )
        SELECT c.country_name, c.country_code, c.provider_count,
               COALESCE(c.provider_count - p.provider_count, 0) as delta_24h
        FROM current c
        LEFT JOIN past p ON c.country_code = p.country_code
        WHERE (p.provider_count IS NULL OR c.provider_count - p.provider_count < 0)
        ORDER BY c.provider_count ASC
    """, (latest, day_ago))
    near_zero = [dict(row) for row in cursor.fetchall()]

    conn.close()
    return jsonify({
        'disappeared': disappeared,
        'near_zero': near_zero
    })

@provider_bp.route('/comparison/<code1>/<code2>')
def api_comparison(code1, code2):
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT timestamp, provider_count
        FROM provider_counts
        WHERE country_code = ?
        ORDER BY timestamp
    """, (code1.lower(),))
    data1 = [{'timestamp': row[0], 'code': code1.upper(), 'count': row[1]} for row in cursor.fetchall()]

    cursor.execute("""
        SELECT timestamp, provider_count
        FROM provider_counts
        WHERE country_code = ?
        ORDER BY timestamp
    """, (code2.lower(),))
    data2 = [{'timestamp': row[0], 'code': code2.upper(), 'count': row[1]} for row in cursor.fetchall()]

    conn.close()
    return jsonify({'data1': data1, 'data2': data2})

@provider_bp.route('/movers-detailed')
def api_movers_detailed():
    conn = get_db()
    cursor = conn.cursor()

    latest_row = cursor.execute("SELECT MAX(timestamp) FROM provider_counts").fetchone()
    if not latest_row or not latest_row[0]:
        conn.close()
        return jsonify({'gainers': [], 'losers': []})
    latest = latest_row[0]

    windows = {
        '15m': 15, '1h': 60, '2h': 120, '3h': 180, '6h': 360,
        '12h': 720, '24h': 1440, '2d': 2880, '3d': 4320,
        '4d': 5760, '5d': 7200, '6d': 8640, '7d': 10080
    }

    latest_dt = datetime.fromisoformat(latest)

    cursor.execute("SELECT DISTINCT country_code FROM provider_counts WHERE timestamp = ? ORDER BY country_code", (latest,))
    all_countries = [row[0] for row in cursor.fetchall()]

    country_data = {}
    for cc in all_countries:
        country_data[cc] = {'code': cc, 'deltas': {}}

    cursor.execute("SELECT country_code, country_name, provider_count FROM provider_counts WHERE timestamp = ?", (latest,))
    for row in cursor.fetchall():
        cc = row[0]
        if cc in country_data:
            country_data[cc]['name'] = row[1]
            country_data[cc]['current'] = row[2]

    for window_name, minutes in windows.items():
        window_time = latest_dt - timedelta(minutes=minutes)
        window_str = window_time.isoformat(sep=' ')

        cursor.execute("""
            SELECT country_code, provider_count
            FROM provider_counts
            WHERE timestamp = (
                SELECT MAX(timestamp) FROM provider_counts
                WHERE timestamp <= ? AND country_code = provider_counts.country_code
            )
        """, (window_str,))

        past_counts = {row[0]: row[1] for row in cursor.fetchall()}

        for cc in country_data:
            past_count = past_counts.get(cc, country_data[cc].get('current', 0))
            delta = country_data[cc].get('current', 0) - past_count
            country_data[cc]['deltas'][window_name] = delta

    sorted_countries = sorted(
        [data for data in country_data.values() if 'current' in data],
        key=lambda x: x['deltas'].get('24h', 0),
        reverse=True
    )

    gainers = sorted_countries[:50]
    losers = sorted(sorted_countries, key=lambda x: x['deltas'].get('24h', 0))[:50]

    conn.close()
    return jsonify({'gainers': gainers, 'losers': losers})

@provider_bp.route('/country/<code>')
def api_country(code):
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT timestamp, provider_count 
        FROM provider_counts 
        WHERE country_code = ? 
        ORDER BY timestamp DESC LIMIT 720
    """, (code.lower(),))
    data = [{'timestamp': row[0], 'count': row[1]} for row in cursor.fetchall()]
    data.reverse()
    
    conn.close()
    return jsonify(data)
