from click.parser import OptionParser


def test_envvar_default_is_used():
    parser = OptionParser()
    assert parser.handle_parse_result({}, {"CLICK_DEFAULT": "from-env"})["default"] == "from-env"
