"""
Strategy template: Add Orientation
==================================

This is a special template that allows adding an orientation row via the 
Operation Library. Since the front-end handles orientation entries 
separately as `kind: "orient"`, this template serves as a UI trigger.

The actual effect of this template is handled in the frontend's `applyTemplate`
logic or by adding a custom handler in `opsStore`.
"""

from toolpath_engine import process

@process(
    "add_orient",
    description="Add a new orientation rule block to the timeline.",
    tags=["setup", "orient"],
    kind="orient",
    label="Add Orientation",
    icon="orient",
    requires=[],
    params=[],
    est_time=0,
    est_volume=0,
)
def add_orient(model=None, geometry=None, params=None):
    """
    This function is technically never called by the backend because the 
    frontend creates an 'orient' entry directly. It exists so the template
    is registered and discoverable by the Operation Library.
    """
    return None
