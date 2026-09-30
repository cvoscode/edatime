# conf.py

**Purpose:** Sphinx documentation configuration for the EdaTime project.

## Variables

```python
project = "EdaTime"
```

```python
copyright = f"{date.today().year}, EdaTime contributors"
```

```python
author = "EdaTime contributors"
```

## Dictionaries

```python
extensions = [
    "myst_parser",
    "sphinx_design",
    "sphinxcontrib.mermaid",
]
```

```python
source_suffix = {
    ".md": "myst",
    ".rst": "restructuredtext",
}
```

```python
myst_enable_extensions = [
    "colon_fence",
    "deflist",
    "fieldlist",
    "substitution",
]
```

```python
html_theme_options = {
    "light_css_variables": { ... },
    "dark_css_variables": { ... },
}
```

## Values

```python
root_doc = "index"
```

```python
templates_path = []
```

```python
exclude_patterns = ["_build", "Thumbs.db", ".DS_Store"]
```

```python
myst_heading_anchors = 3
```

```python
html_theme = "furo"
```

```python
html_title = "EdaTime Docs"
```

```python
html_static_path = ["_static"]
```

```python
html_css_files = ["edatime-docs.css"]
```

```python
html_js_files = ["edatime-docs.js"]
```

```python
html_show_sphinx = False
```

```python
html_copy_source = False
```
