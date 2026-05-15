from .parser import OptionParser


class Command:
    def __init__(self) -> None:
        self.parser = OptionParser()

    def parse_args(self, args, env):
        return self.parser.handle_parse_result(args, env)
