package com.animasys.core.exception;

import com.animasys.core.response.ApiResponseWrapper;
import com.animasys.modules.ai.exception.AIServiceException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import jakarta.validation.ConstraintViolationException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ApiResponseWrapper.error(ex.getMessage()));
    }

    @ExceptionHandler(AIServiceException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleAiService(AIServiceException ex) {
        log.warn("AI service failure [{}]: {}", ex.getErrorCode(), ex.getMessage());
        return ResponseEntity
                .status(ex.getHttpStatus())
                .body(ApiResponseWrapper.error(ex.getMessage()));
    }

    @ExceptionHandler(BusinessRuleException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleBusinessRule(BusinessRuleException ex) {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error(ex.getMessage()));
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleBadCredentials(BadCredentialsException ex) {
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponseWrapper.error("Invalid username or password"));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleAccessDenied(AccessDeniedException ex) {
        return ResponseEntity
                .status(HttpStatus.FORBIDDEN)
                .body(ApiResponseWrapper.error("Access denied: You do not have permissions for this operation"));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleAuthentication(AuthenticationException ex) {
        log.warn("Authentication failed [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.UNAUTHORIZED)
                .body(ApiResponseWrapper.error("Authentication required or token invalid"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        log.warn("Method not supported [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(ApiResponseWrapper.error("HTTP method not supported for this endpoint"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleNoResource(NoResourceFoundException ex) {
        log.debug("Resource not found [{}]: {}", MDC.get("requestId"), ex.getResourcePath());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ApiResponseWrapper.error("Resource not found"));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleMissingParam(MissingServletRequestParameterException ex) {
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("Missing required parameter: " + ex.getParameterName()));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleMediaType(HttpMediaTypeNotSupportedException ex) {
        return ResponseEntity
                .status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(ApiResponseWrapper.error("Unsupported Content-Type"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String defaultMsg = ex.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error(defaultMsg));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleConstraintViolation(ConstraintViolationException ex) {
        String msg = ex.getConstraintViolations().stream()
                .map(v -> v.getPropertyPath() + ": " + v.getMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        log.warn("Constraint violation: {}", msg);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error(msg));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        log.warn("Type mismatch for parameter '{}': {}", ex.getName(), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("Invalid value for parameter: " + ex.getName()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleUnreadable(HttpMessageNotReadableException ex) {
        log.warn("Malformed request body [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("طلب غير صالح: تعذر قراءة بيانات الطلب"));
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        log.warn("Optimistic locking conflict: {}", ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.CONFLICT)
                .body(ApiResponseWrapper.error("This record was modified by another user. Please refresh and try again."));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleDataIntegrity(DataIntegrityViolationException ex) {
        log.error("Data integrity violation: {}", ex.getMessage());
        String detail = rootMessage(ex);
        String lower = detail == null ? "" : detail.toLowerCase();
        if (lower.contains("sku") || lower.contains("products")) {
            return ResponseEntity
                    .status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(ApiResponseWrapper.error("كود SKU مستخدم مسبقاً"));
        }
        if (lower.contains("brand")) {
            return ResponseEntity
                    .status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(ApiResponseWrapper.error("تعذر حفظ الماركة — اسم الماركة متعارض"));
        }
        if (lower.contains("barcode")) {
            return ResponseEntity
                    .status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(ApiResponseWrapper.error("هذا الباركود مستخدم بالفعل لمنتج آخر"));
        }
        return ResponseEntity
                .status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(ApiResponseWrapper.error("تعذر حفظ البيانات بسبب قيد في قاعدة البيانات. راجع المدخلات وحاول مجدداً."));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Illegal argument [{}]: {}", MDC.get("requestId"), ex.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("Invalid request parameters"));
    }

    @ExceptionHandler(NullPointerException.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleNullPointer(NullPointerException ex) {
        log.error("NullPointerException [{}]: {}", MDC.get("requestId"), ex.getMessage(), ex);
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ApiResponseWrapper.error("بيانات الطلب غير مكتملة. تحقق من الحقول المطلوبة وحاول مجدداً."));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponseWrapper<Void>> handleGeneric(Exception ex) {
        AIServiceException ai = findCause(ex, AIServiceException.class);
        if (ai != null) {
            return handleAiService(ai);
        }
        BusinessRuleException business = findCause(ex, BusinessRuleException.class);
        if (business != null) {
            return handleBusinessRule(business);
        }
        ResourceNotFoundException notFound = findCause(ex, ResourceNotFoundException.class);
        if (notFound != null) {
            return handleNotFound(notFound);
        }
        DataIntegrityViolationException integrity = findCause(ex, DataIntegrityViolationException.class);
        if (integrity != null) {
            return handleDataIntegrity(integrity);
        }
        NullPointerException npe = findCause(ex, NullPointerException.class);
        if (npe != null) {
            return handleNullPointer(npe);
        }

        log.error("Unexpected error [{}] tenant={} employee={}: {}",
                MDC.get("requestId"), MDC.get("tenantId"), MDC.get("employeeId"), ex.getMessage(), ex);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponseWrapper.error("An unexpected error occurred. Please contact support."));
    }

    private static String rootMessage(Throwable ex) {
        Throwable cur = ex;
        String last = ex.getMessage();
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
            if (cur.getMessage() != null && !cur.getMessage().isBlank()) {
                last = cur.getMessage();
            }
        }
        return last;
    }

    @SuppressWarnings("unchecked")
    private static <T extends Throwable> T findCause(Throwable ex, Class<T> type) {
        Throwable cur = ex;
        while (cur != null) {
            if (type.isInstance(cur)) {
                return (T) cur;
            }
            if (cur.getCause() == cur) {
                break;
            }
            cur = cur.getCause();
        }
        return null;
    }
}
