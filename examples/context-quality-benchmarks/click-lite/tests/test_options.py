from click.parser import OptionParser


def test_explicit_option_beats_envvar_default():
    parser = OptionParser()
    assert parser.handle_parse_result({"default": "explicit"}, {"CLICK_DEFAULT": "env"})["default"] == "explicit"
