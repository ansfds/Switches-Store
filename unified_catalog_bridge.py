"""One local catalog API for the existing storefront and the authenticated admin."""
import json
import os
from pathlib import Path
import sqlite3
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request,urlopen


def api_base():
    value=os.getenv('SWITCHES_CATALOG_API_URL','http://127.0.0.1:8001').rstrip('/')
    parsed=urlsplit(value)
    if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost','::1'):
        raise RuntimeError('The local catalog API must use a loopback address.')
    return value


def forward(handler,parsed,method):
    path=parsed.path
    if path=='/admin' or path.startswith('/admin/'):
        handler.redirect(api_base()+'/admin')
        return True
    if path.startswith('/api/local-admin/'):
        handler.json_response(410,{'error':'catalog_admin_moved','detail':'استخدم لوحة الإدارة المتصلة بقاعدة الكتالوج المشتركة.','adminUrl':api_base()+'/admin'})
        return True
    aliases={'/data/gift-cards.json':'/api/public/gift-cards'}
    upstream=aliases.get(path,path)
    public=upstream in ('/health','/api/public/bootstrap','/api/public/products','/api/public/sections','/api/public/subscriptions','/api/public/gift-cards','/api/public/settings') or upstream.startswith(('/api/public/products/','/api/public/gift-cards/'))
    asset=path.startswith(('/uploads/','/admin-static/','/site-static/'))
    if method!='GET' or not(public or asset):
        return False
    try:
        request=Request(api_base()+upstream+('?' + parsed.query if parsed.query else ''),headers={'Accept':'application/json' if public else '*/*'})
        with urlopen(request,timeout=8) as response:
            body=response.read(); status=response.status; content_type=response.headers.get('Content-Type','application/octet-stream')
    except HTTPError as error:
        body=error.read();status=error.code;content_type=error.headers.get('Content-Type','application/json')
    except Exception as error:
        handler.json_response(503,{'error':'catalog_unavailable','detail':str(error)})
        return True
    handler.send_response(status)
    handler.send_header('Content-Type',content_type)
    handler.send_header('Cache-Control','no-store')
    handler.send_header('Content-Length',str(len(body)))
    handler.end_headers();handler.wfile.write(body)
    return True


def catalog_record():
    path=os.environ.get('SWITCHES_CATALOG_DB','')
    if not path:
        raise RuntimeError('SWITCHES_CATALOG_DB must point to the shared catalog SQLite database.')
    with sqlite3.connect('file:'+Path(path).resolve().as_posix()+'?mode=ro',uri=True) as conn:
        section=conn.execute("SELECT is_active,availability FROM categories WHERE kind='gift_cards' AND parent_id IS NULL ORDER BY id LIMIT 1").fetchone()
        if not section or not section[0] or section[1]!='available':
            return []
        row=conn.execute('SELECT payload_json FROM gift_catalog WHERE id=1').fetchone()
        if not row:
            raise RuntimeError('The shared gift catalog migration has not run.')
        return json.loads(row[0])['platforms']


def selection(product_id,region_id,value):
    platform=next((p for p in catalog_record() if str(p['id'])==str(product_id)),None)
    if not platform or not platform['isActive'] or platform['availability']!='available':
        raise ValueError('product_unavailable')
    region=next((r for r in platform['regions'] if r['id']==str(region_id)),None)
    if not region or not region['isActive'] or not region['available']:
        raise ValueError('region_unavailable')
    denomination=next((d for d in region['denominations'] if float(d['value'])==float(value)),None)
    if not denomination or not denomination['isActive'] or denomination['availability']!='available':
        raise ValueError('denomination_unavailable')
    if denomination['sellingPriceLYD'] is None:
        raise ValueError('price_quote_required')
    return {'product_id':platform['id'],'product_name':platform['name'],'region_id':region['id'],'region_name':region.get('label') or region['name'],'region_currency':region['currency'],'denomination_value':denomination['value'],'denomination_currency':region['currency'],'selling_price_lyd':denomination['sellingPriceLYD']}
