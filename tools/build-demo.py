import json, re, sys, pathlib
d = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2])
html = (d/'index.html').read_text()
head_bits = '<title>Soundbite</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + \
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Inter:wght@400;500;600&display=swap">\n'
body = html.split('<body>',1)[1].split('</body>',1)[0]
body = re.sub(r'<script src="config.js[^"]*"></script>\s*<script src="app.js[^"]*"></script>', '', body)
worker = (d/'vendor/lame.min.js').read_text() + '\n' + (d/'encoder-worker.js').read_text()
cfg = 'window.SOUNDBITE_FORCE_DEMO=true;window.SOUNDBITE_CONFIG={bandName:"A nossa banda"};\nwindow.SOUNDBITE_WORKER_SRC=' + json.dumps(worker).replace('</','<\\/') + ';'
app = (d/'app.js').read_text()
assert '</script' not in app
page = head_bits + '<style>\n' + (d/'styles.css').read_text() + '\n</style>\n' + body + '<script>\n' + cfg + '\n</script>\n<script>\n' + app + '\n</script>\n'
out.write_text(page); print(len(page))
