use fd_lite::walk::ignore_hidden;

#[test]
fn hidden_files_are_filtered_by_default() {
    assert!(ignore_hidden(".git/config", false));
}
