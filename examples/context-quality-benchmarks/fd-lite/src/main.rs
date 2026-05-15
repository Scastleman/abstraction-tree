mod cli;
mod walk;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let options = cli::parse_hidden_flag(&args);
    let _files = walk::collect_entries(".", options.hidden);
}
