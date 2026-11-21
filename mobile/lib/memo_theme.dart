import 'package:flutter/material.dart';

const _canvas = Color(0xFFF6F7FB);
const _surface = Color(0xFFFFFFFF);
const _ink = Color(0xFF17192B);
const _muted = Color(0xFF56617A);
const _line = Color(0xFFE4E8F1);
const _accent = Color(0xFF4B43DA);
const _accentDark = Color(0xFF3A32B7);
const _accentSoft = Color(0xFFEFEEFF);

ThemeData memoTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: _accent).copyWith(
    primary: _accent,
    onPrimary: Colors.white,
    primaryContainer: _accentSoft,
    onPrimaryContainer: _accentDark,
    secondaryContainer: _accentSoft,
    onSecondaryContainer: _accentDark,
    surface: _surface,
    onSurface: _ink,
    onSurfaceVariant: _muted,
    outlineVariant: _line,
  );
  final base = ThemeData(
    colorScheme: scheme,
    scaffoldBackgroundColor: _canvas,
    dividerColor: _line,
    useMaterial3: true,
  );
  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      headlineMedium: base.textTheme.headlineMedium?.copyWith(
        fontWeight: FontWeight.w700,
        letterSpacing: -1,
      ),
      titleMedium: base.textTheme.titleMedium?.copyWith(
        fontWeight: FontWeight.w700,
      ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: scheme.surface,
      indicatorColor: scheme.primaryContainer,
      elevation: 0,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
  );
}
