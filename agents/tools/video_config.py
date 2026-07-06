"""
FOPS Video Formatter — Core data models and channel configuration.

Extracted from the Rotana Video Formatter desktop tool.
All channel templates, social links, and default configs live here.
"""

DEFAULT_CHANNELS = [
    "Rotana Music",
    "Majid Almohandis l ماجد المهندس",
    "Sara Salman - سارة سلمان",
    "عبدالمجيد عبدالله | Abdul Majeed Abdullah",
    "نوال | Nawal",
    "رحاب الشمراني",
    "تهاني السلطان",
    "Rotana Jalsat جلسات روتانا",
    "iVoice Music",
    "The Talent",
    "Huda AlFahad",
    "Rand Ahmad - رند أحمد",
    "Assala Nasri",
    "Adel Al Mukhtar",
    "Nabeel Shuail",
    "Ali Bin Mohammed - علي بن محمد",
]

# Default subscribe/channel description text per channel
DEFAULT_CHANNEL_DESCRIPTIONS = {
    "عبدالمجيد عبدالله | Abdul Majeed Abdullah": (
        "\nاشترك الآن في قناة الفنان عبدالمجيد عبدالله للحصول على أجدد إصداراته الفنية\n"
        "http://goo.gl/ZMxIXH\n"
        "\n✶ Digital Distribution : @RotanaMusic\n"
        "\nFacebook: https://facebook.com/Abdulmajeed6531/\n"
        "Twitter: https://twitter.com/abdulmajeed6531\n"
        "Instagram: https://www.instagram.com/mjeedifans/\n"
        "iTunes: https://itun.es/sa/ZzT3\n"
        "Google +: https://goo.gl/S90f5L\n"
        "Youtube: http://bit.ly/2mpg1Cu"
    ),
}

DEFAULT_SUBSCRIBE_TEXT = (
    "\nاشترك على قناة روتانا | Subscribe To Rotana Channel\n"
    "https://bit.ly/2NjviPh\n"
)

SOCIAL_LINKS = (
    "\n✶ https://www.facebook.com/rotanamusic/\n"
    "✶ https://www.instagram.com/rotanamusic/\n"
    "✶ https://twitter.com/RotanaMusic\n"
)

VALID_VIDEO_TYPES = ["Lyrics Video", "Music Video", "Concert"]
