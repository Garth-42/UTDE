"""
Built-in process templates that ship with UTDE.

Importing this package auto-registers every template via the @process
decorator. Front-end Operation Library introspection goes through
toolpath_engine.list_processes() once this package has been imported.

Templates are plain Python files; users can drop their own into this
directory or load them from elsewhere by importing them directly.
"""

import importlib
import pkgutil


def _autoload():
    """Import every sibling module so its @process decorators run."""
    package = __name__
    for mod in pkgutil.iter_modules(__path__):
        importlib.import_module(f"{package}.{mod.name}")


_autoload()
