"""
Base class for all toolpath generation strategies.

Every strategy — built-in, external engine wrapper, or user-defined —
implements this interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

from ..core.toolpath import ToolpathCollection
from ..core.geometry import GeometryModel, Surface, Curve


class ToolpathStrategy(ABC):
    """
    Base class for toolpath generation strategies.
    
    Subclass this to create custom strategies. The strategy receives
    geometry and parameters, and returns a ToolpathCollection.
    """

    def __init__(self, name: str = ""):
        self.name = name
        self.params: Dict[str, Any] = {}

    def configure(self, **kwargs):
        """Set strategy parameters."""
        self.params.update(kwargs)
        return self  # allow chaining

    @abstractmethod
    def generate(self, **kwargs) -> ToolpathCollection:
        """
        Generate toolpaths from geometry.
        
        Returns a ToolpathCollection with typed, oriented points.
        """
        pass

    def __repr__(self):
        return f"{self.__class__.__name__}('{self.name}', params={self.params})"
