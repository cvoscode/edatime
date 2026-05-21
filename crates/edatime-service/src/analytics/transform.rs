//! Column transformations — expression parsing and application.
//!
//! These are sync functions intended to be called from blocking threads
//! (e.g., via `tokio::task::spawn_blocking`). They do NOT use `block_in_place`
//! internally — callers are responsible for proper async thread dispatch.

use crate::error::AppError;
use polars::prelude::*;

const ALLOWED_OPS: &[&str] = &["+", "-", "*", "/", "%"];
const ALLOWED_FUNCTIONS: &[&str] = &[
    "abs", "log", "log2", "log10", "sqrt", "exp", "sin", "cos", "tan", "ceil", "floor", "round",
];

fn validate_transform_inputs(expression: &str, output_name: &str) -> Result<Expr, AppError> {
    let expr = expression.trim();
    if expr.is_empty() {
        return Err(AppError::bad_request("Expression is empty"));
    }
    if output_name.trim().is_empty() || output_name == "ts" {
        return Err(AppError::bad_request("Invalid output column name"));
    }
    parse_expression_lazy(expr)
}

/// Apply a Polars expression transform to a DataFrame.
/// Caller is responsible for dispatching to a blocking thread if needed.
pub fn apply_column_transform(
    df: &DataFrame,
    expression: &str,
    output_name: &str,
) -> Result<DataFrame, AppError> {
    let polars_expr = validate_transform_inputs(expression, output_name)?;
    let result = df
        .clone()
        .lazy()
        .with_column(polars_expr.alias(output_name))
        .with_new_streaming(true)
        .collect()
        .map_err(|e| AppError::internal(format!("Transform execution failed: {e}")))?;

    Ok(result)
}

/// Apply a Polars expression transform to a LazyFrame.
/// Caller is responsible for dispatching to a blocking thread if needed.
pub fn apply_column_transform_lazy(
    lf: &LazyFrame,
    expression: &str,
    output_name: &str,
) -> Result<DataFrame, AppError> {
    let polars_expr = validate_transform_inputs(expression, output_name)?;
    lf.clone()
        .with_column(polars_expr.alias(output_name))
        .with_new_streaming(true)
        .collect()
        .map_err(|e| AppError::internal(format!("Transform execution failed: {e}")))
}

fn parse_expression_lazy(expr: &str) -> Result<Expr, AppError> {
    parse_expression_impl(expr, None)
}

fn parse_expression_impl(expr: &str, df: Option<&DataFrame>) -> Result<Expr, AppError> {
    let expr = expr.trim();

    if let Some(open) = expr.find('(')
        && expr.ends_with(')')
    {
        let func_name = expr[..open].trim().to_lowercase();
        let inner = expr[open + 1..expr.len() - 1].trim();

        if !ALLOWED_FUNCTIONS.contains(&func_name.as_str()) {
            return Err(AppError::bad_request(format!(
                "Unknown function '{}'. Allowed: {}",
                func_name,
                ALLOWED_FUNCTIONS.join(", ")
            )));
        }

        let inner_expr = parse_expression_impl(inner, df)?;
        return apply_function(&func_name, inner_expr);
    }

    for op in ALLOWED_OPS {
        let mut depth = 0i32;
        let chars: Vec<char> = expr.chars().collect();
        let op_chars: Vec<char> = op.chars().collect();

        if *op == "+" || *op == "-" {
            for i in (0..chars.len()).rev() {
                if chars[i] == ')' {
                    depth += 1;
                } else if chars[i] == '(' {
                    depth -= 1;
                }
                if depth == 0 && i > 0 && chars[i] == op_chars[0] {
                    if *op == "-" && (i == 0 || "+-*/%(".contains(chars[i - 1])) {
                        continue;
                    }
                    let left = expr[..i].trim();
                    let right = expr[i + 1..].trim();
                    if !left.is_empty() && !right.is_empty() {
                        let left_expr = parse_expression_impl(left, df)?;
                        let right_expr = parse_expression_impl(right, df)?;
                        return apply_binary_op(left_expr, right_expr, op);
                    }
                }
            }
        } else {
            for i in (0..chars.len()).rev() {
                if chars[i] == ')' {
                    depth += 1;
                } else if chars[i] == '(' {
                    depth -= 1;
                }
                if depth == 0 && chars[i] == op_chars[0] {
                    let left = expr[..i].trim();
                    let right = expr[i + 1..].trim();
                    if !left.is_empty() && !right.is_empty() {
                        let left_expr = parse_expression_impl(left, df)?;
                        let right_expr = parse_expression_impl(right, df)?;
                        return apply_binary_op(left_expr, right_expr, op);
                    }
                }
            }
        }
    }

    if let Ok(number) = expr.parse::<f64>() {
        return Ok(lit(number));
    }

    let col_names: Vec<String> = df
        .map(|d| d.get_column_names().iter().map(|c| c.to_string()).collect())
        .unwrap_or_default();

    if col_names.is_empty() || col_names.contains(&expr.to_string()) {
        return Ok(col(expr));
    }

    Err(AppError::bad_request(format!(
        "Unknown token '{}'. Expected column name, number, or expression. Available columns: {}",
        expr,
        col_names.join(", ")
    )))
}

fn apply_binary_op(left: Expr, right: Expr, op: &str) -> Result<Expr, AppError> {
    match op {
        "+" => Ok(left + right),
        "-" => Ok(left - right),
        "*" => Ok(left * right),
        "/" => Ok(left / right),
        "%" => Ok(left % right),
        _ => Err(AppError::bad_request(format!("Unknown operator '{}'", op))),
    }
}

fn apply_function(name: &str, inner: Expr) -> Result<Expr, AppError> {
    match name {
        "abs" => Ok(float_map(inner, |x| x.abs())),
        "log" => Ok(float_map(inner, |x| x.ln())),
        "log2" => Ok(float_map(inner, |x| x.log2())),
        "log10" => Ok(float_map(inner, |x| x.log10())),
        "sqrt" => Ok(float_map(inner, |x| x.sqrt())),
        "exp" => Ok(float_map(inner, |x| x.exp())),
        "sin" => Ok(float_map(inner, |x| x.sin())),
        "cos" => Ok(float_map(inner, |x| x.cos())),
        "tan" => Ok(float_map(inner, |x| x.tan())),
        "ceil" => Ok(float_map(inner, |x| x.ceil())),
        "floor" => Ok(float_map(inner, |x| x.floor())),
        "round" => Ok(float_map(inner, |x| x.round())),
        _ => Err(AppError::bad_request(format!(
            "Unknown function '{}'",
            name
        ))),
    }
}

fn float_map(expr: Expr, f: fn(f64) -> f64) -> Expr {
    expr.cast(DataType::Float64).map(
        move |s| {
            let ca = s.f64()?;
            let out: Float64Chunked = ca.into_iter().map(|v| v.map(f)).collect();
            Ok(out.into_column())
        },
        |_schema: &Schema, _field: &Field| Ok(Field::new("".into(), DataType::Float64)),
    )
}
