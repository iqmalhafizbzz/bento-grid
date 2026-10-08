"""Turn the single-file build (dist-artifact/index.html) into a claude.ai Artifact page body.

The Artifact host wraps the page in its own <html>/<head>/<body>, so this keeps only the
title, font links, inlined CSS, the theme bootstrap script and the inlined app bundle.
Usage: python3 scripts/package-artifact.py <output.html>
"""
import re
import sys

src = open('dist-artifact/index.html').read()


def grab(open_tag, close_tag):
    i = src.index(open_tag)
    return src[i:src.index(close_tag, i) + len(close_tag)]


head = src[:src.index('<script type="module"')]
fonts = re.findall(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.[^"]+"[^>]*>', head)
style = grab('<style rel="stylesheet" crossorigin>', '</style>').replace(' rel="stylesheet" crossorigin', '')
app = grab('<script type="module" crossorigin>', '</script>').replace(' crossorigin', '', 1)
out = '\n'.join([grab('<title>', '</title>'), *fonts, style, grab('<script>\n', '</script>'), '<div id="root"></div>', app]) + '\n'
open(sys.argv[1], 'w').write(out)
print(f'wrote {sys.argv[1]} ({len(out):,} bytes)')
