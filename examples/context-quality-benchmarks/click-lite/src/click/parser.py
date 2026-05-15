class OptionParser:
    def value_from_envvar(self, name, env):
        return env.get(name)

    def handle_parse_result(self, args, env):
        parsed = dict(args)
        if "default" not in parsed:
            parsed["default"] = self.value_from_envvar("CLICK_DEFAULT", env)
        return parsed
