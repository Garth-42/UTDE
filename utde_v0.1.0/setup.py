from setuptools import setup, find_packages

setup(
    name="toolpath-engine",
    version="0.1.0",
    description="Universal Toolpath Design Environment — a process-agnostic platform for multi-axis toolpath generation",
    author="UTDE Contributors",
    license="MIT",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "numpy>=1.20",
        "scipy>=1.7",
        "pyyaml>=6.0",
    ],
    extras_require={
        "cad": ["pythonocc-core>=7.7"],
        "viz": ["trimesh>=3.0", "matplotlib>=3.5"],
        "dev": ["pytest>=7.0", "black", "mypy"],
    },
    entry_points={
        "console_scripts": [
            "utde=toolpath_engine.cli:main",
        ],
    },
)
