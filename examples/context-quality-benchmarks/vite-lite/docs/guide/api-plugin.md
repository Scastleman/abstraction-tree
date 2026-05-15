# Plugin API

The plugin container resolves modules by asking Vite plugins in order. A plugin
can return a resolved id, delegate to the mixed module graph, or leave the import
for the next plugin in the chain.

Module resolution bugs usually need the plugin container, plugin type contracts,
and mixed module graph behavior in the same context pack.
