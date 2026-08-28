with open(r'C:\Users\mr ahmed\Desktop\educore-system\app\components\ExpensesTab.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

single_quotes = content.count("'")
double_quotes = content.count('"')
backticks = content.count('`')

print('Single quotes:', single_quotes, 'balanced:', single_quotes % 2 == 0)
print('Double quotes:', double_quotes, 'balanced:', double_quotes % 2 == 0)
print('Backticks:', backticks, 'balanced:', backticks % 2 == 0)

parens = content.count('(') - content.count(')')
braces = content.count('{') - content.count('}')
brackets = content.count('[') - content.count(']')
angle = content.count('<') - content.count('>')

print('Parens balance:', parens)
print('Braces balance:', braces)
print('Brackets balance:', brackets)
print('Angle brackets balance:', angle)