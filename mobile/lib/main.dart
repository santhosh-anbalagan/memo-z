import 'package:flutter/material.dart';

import 'memo_theme.dart';

void main() {
  runApp(MaterialApp(
      title: 'Memo Z', theme: memoTheme(), home: const JournalPreview()));
}

class JournalPreview extends StatefulWidget {
  const JournalPreview({super.key});

  @override
  State<JournalPreview> createState() => _JournalPreviewState();
}

class _JournalPreviewState extends State<JournalPreview> {
  static const _titles = ['Today', 'All entries', 'Calendar', 'Profile'];
  final _sampleDate = DateUtils.dateOnly(DateTime.now());
  late DateTime _date = _sampleDate;
  int _section = 0;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = theme.colorScheme;
    final localizations = MaterialLocalizations.of(context);
    final sampleVisible =
        _section == 1 || DateUtils.isSameDay(_date, _sampleDate);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Memo Z'),
        centerTitle: false,
        backgroundColor: colors.surface,
        leading: Icon(Icons.menu_book_rounded, color: colors.primary),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Tooltip(
              message: 'Sample data',
              child: Icon(Icons.info_outline),
            ),
          ),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          children: [
            if (_section == 0 || _section == 2) ...[
              Text(
                localizations.formatFullDate(_date),
                style: theme.textTheme.bodyMedium
                    ?.copyWith(color: colors.onSurfaceVariant),
              ),
              const SizedBox(height: 6),
            ],
            Text(_titles[_section], style: theme.textTheme.headlineMedium),
            const SizedBox(height: 20),
            if (_section == 2) ...[
              Card(
                child: CalendarDatePicker(
                  initialDate: _date,
                  firstDate: DateTime(1900),
                  lastDate: DateTime(9999, 12, 31),
                  onDateChanged: (value) => setState(() => _date = value),
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (_section != 3)
              Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: colors.primaryContainer,
                    foregroundColor: colors.onPrimaryContainer,
                    child: const Icon(Icons.article_outlined, size: 20),
                  ),
                  title: Text(
                    sampleVisible
                        ? 'A small moment worth keeping'
                        : 'No entries yet',
                    style: theme.textTheme.titleMedium,
                  ),
                  subtitle: Text(
                    sampleVisible
                        ? localizations.formatMediumDate(_sampleDate)
                        : 'Entries for this date will appear here.',
                  ),
                ),
              )
            else
              const Card(
                child: ListTile(
                  leading: Icon(Icons.person_outline_rounded),
                  title: Text('Design preview'),
                  subtitle: Text('This screen uses sample data.'),
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _section,
        onDestinationSelected: (value) => setState(() {
          _section = value;
          if (value == 0) _date = _sampleDate;
        }),
        destinations: const [
          NavigationDestination(
              icon: Icon(Icons.wb_sunny_outlined), label: 'Today'),
          NavigationDestination(
              icon: Icon(Icons.article_outlined), label: 'All entries'),
          NavigationDestination(
              icon: Icon(Icons.calendar_month_outlined), label: 'Calendar'),
          NavigationDestination(
              icon: Icon(Icons.person_outline_rounded), label: 'Profile'),
        ],
      ),
    );
  }
}
