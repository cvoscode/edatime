import re
with open('/home/crispy/edatime/frontend/css/style.css', 'r') as f:
    css = f.read()

# Remove select option dark styling
css = re.sub(r'/\* Dark background for the native dropdown list \*/\nselect option {\n[^\}]+\n}\n', '', css)

# Remove the weird adaptive-target ::after
css = re.sub(r'\.series-chip\.adaptive-target \.chip-label::after \{\n[^\}]+\n\}\n', '', css)

# Fix scrollbars: Only apply custom scrollbar to specific containers like .series-toggles, .profile-grid-viewport, .scatter-distributions, .scatter-matrix, .page-upload, .page, etc. Or just set general html/body or specific classes, wait the user said: "remove scrollbars where not needed. ont he column slect they are needed."

# Let's adjust global scrollbar
css = re.sub(r'::-webkit-scrollbar \{[^\}]+\}', '::-webkit-scrollbar { width: 0px; height: 0px; } /* Hidden by default */\n.series-toggles::-webkit-scrollbar, .scatter-matrix::-webkit-scrollbar, .scatter-distributions::-webkit-scrollbar, .app-content::-webkit-scrollbar, .page::-webkit-scrollbar, .profile-grid-viewport::-webkit-scrollbar, .upload-inner::-webkit-scrollbar { width: 6px; height: 6px; }', css)

with open('/home/crispy/edatime/frontend/css/style.css', 'w') as f:
    f.write(css)
