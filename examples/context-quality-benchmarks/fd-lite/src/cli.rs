pub struct Options {
    pub hidden: bool,
}

pub fn parse_hidden_flag(args: &[String]) -> Options {
    Options {
        hidden: args.iter().any(|arg| arg == "--hidden"),
    }
}
