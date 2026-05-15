fn main() {
    let s = String::from("hello");
    takes_ownership(s);
}

fn takes_ownership(value: String) {
    println!("{value}");
}
