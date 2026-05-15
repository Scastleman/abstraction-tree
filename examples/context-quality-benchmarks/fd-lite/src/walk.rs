pub fn ignore_hidden(path: &str, include_hidden: bool) -> bool {
    !include_hidden && path.split('/').any(|part| part.starts_with('.'))
}

pub fn collect_entries(root: &str, include_hidden: bool) -> Vec<String> {
    vec![root.to_string()]
        .into_iter()
        .filter(|path| !ignore_hidden(path, include_hidden))
        .collect()
}
