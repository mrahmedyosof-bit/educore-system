from openai import OpenAI

client = OpenAI(
    api_key="sk-Db1auASR90YcagtCL69dY44zUhPuEM0fsDXPwJrHU24s6nHX",
    base_url="https://tokenra.io/v1"  # أضفنا v1 هنا كما هو متعارف عليه في البوابات البديلة
)

try:
    print("جاري الاتصال بـ TokenRa...")
    response = client.chat.completions.create(
        model="stealth/ox-alpha",
        messages=[
            {
                "role": "user",
                "content": "مرحباً، أهلاً بك. اكتب لي رسالة ترحيبية قصيرة."
            }
        ]
    )
    print("الرد من الذكاء الاصطناعي:")
    print(response.choices[0].message.content)
except Exception as e:
    print("حدث خطأ:", e)